import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { findPlaceholder, generateStructured } from './llm';
import { FakeLlmClient } from '../infra/llm/FakeLlmClient';
import { ErrorCode, err } from '../../shared/result';

const Schema = z.object({ grade: z.enum(['A', 'B']), reason: z.string() });

describe('generateStructured', () => {
  it('스키마에 맞으면 그대로 반환한다', async () => {
    const fake = new FakeLlmClient([{ grade: 'A', reason: '양호' }]);
    const r = await generateStructured(fake, { prompt: 'p', schema: Schema });
    expect(r).toEqual({ ok: true, value: { grade: 'A', reason: '양호' } });
    expect(fake.calls).toHaveLength(1);
  });

  it('$schema 키를 제거해서 보낸다', async () => {
    const fake = new FakeLlmClient([{ grade: 'A', reason: 'x' }]);
    await generateStructured(fake, { prompt: 'p', schema: Schema });
    expect(fake.calls[0]!.jsonSchema).not.toHaveProperty('$schema');
  });

  it('스키마 불일치면 오류 내용을 붙여 1회 재시도한다', async () => {
    const fake = new FakeLlmClient([{ grade: 'Z' }, { grade: 'B', reason: '수정' }]);
    const r = await generateStructured(fake, { prompt: '원본', schema: Schema });
    expect(r.ok).toBe(true);
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]!.prompt).toContain('원본');
    expect(fake.calls[1]!.prompt).toContain('스키마에 맞지 않았습니다');
  });

  it('재시도 후에도 불일치면 LLM_INVALID_OUTPUT', async () => {
    const fake = new FakeLlmClient([{ grade: 'Z' }, { grade: 'Y' }]);
    const r = await generateStructured(fake, { prompt: 'p', schema: Schema });
    expect(r).toMatchObject({ ok: false, error: { code: ErrorCode.LlmInvalidOutput } });
    expect(fake.calls).toHaveLength(2);
  });

  it('호출 자체가 실패하면 재시도하지 않는다', async () => {
    const fake = new FakeLlmClient([err(ErrorCode.LlmCallFailed, '네트워크')]);
    const r = await generateStructured(fake, { prompt: 'p', schema: Schema });
    expect(r).toMatchObject({ ok: false, error: { code: ErrorCode.LlmCallFailed } });
    expect(fake.calls).toHaveLength(1);
  });

  it('형식만 맞추고 내용을 비운 "placeholder" 응답은 거절하고 다시 받는다', async () => {
    const fake = new FakeLlmClient([{ grade: 'A', reason: 'placeholder' }, { grade: 'A', reason: '실제 근거' }]);
    const r = await generateStructured(fake, { prompt: '원본', schema: Schema });
    expect(r).toEqual({ ok: true, value: { grade: 'A', reason: '실제 근거' } });
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]!.prompt).toContain('자리표시');
  });

  it('두 번 다 placeholder면 LLM_INVALID_OUTPUT', async () => {
    const fake = new FakeLlmClient([{ grade: 'A', reason: 'placeholder' }, { grade: 'B', reason: 'Placeholder' }]);
    const r = await generateStructured(fake, { prompt: 'p', schema: Schema });
    expect(r).toMatchObject({ ok: false, error: { code: ErrorCode.LlmInvalidOutput } });
  });
});

describe('findPlaceholder', () => {
  it('중첩된 객체·배열 안의 자리표시 값을 찾는다', () => {
    expect(findPlaceholder({ a: [{ b: 'placeholder' }] })).toBe('placeholder');
    expect(findPlaceholder({ a: ' TBD ' })).toBe(' TBD ');
  });
  it('정상 값은 건드리지 않는다 (부분 일치·N/A는 허용)', () => {
    expect(findPlaceholder({ a: 'placeholder가 포함된 문장', b: 'N/A', c: ['실제 값'], d: 3, e: null })).toBeNull();
  });
});
