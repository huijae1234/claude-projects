import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonStore } from './JsonStore';
import { ErrorCode } from '../../../shared/result';

let dir: string;
let store: JsonStore;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'jsonstore-'));
  store = new JsonStore(dir);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('JsonStore', () => {
  it('저장하고 다시 읽는다', async () => {
    await store.put('claims', 'c-1', { text: '이물 발견' });
    expect(await store.get('claims', 'c-1')).toEqual({ ok: true, value: { text: '이물 발견' } });
  });

  it('없는 항목은 NOT_FOUND', async () => {
    expect(await store.get('claims', 'nope')).toMatchObject({ ok: false, error: { code: ErrorCode.NotFound } });
  });

  it('컬렉션 목록을 id 순으로 반환하고, 없는 컬렉션은 빈 배열', async () => {
    await store.put('items', 'b', 2);
    await store.put('items', 'a', 1);
    expect(await store.list('items')).toEqual({ ok: true, value: [1, 2] });
    expect(await store.list('empty')).toEqual({ ok: true, value: [] });
  });

  it('삭제한다', async () => {
    await store.put('items', 'a', 1);
    await store.remove('items', 'a');
    expect(await store.get('items', 'a')).toMatchObject({ ok: false });
  });

  it.each(['../x', 'a/b', '..', 'a.b', ''])('경로 이탈 id "%s"를 거부한다', async (id) => {
    expect(await store.put('items', id, 1)).toMatchObject({ ok: false, error: { code: ErrorCode.InvalidId } });
    expect(await store.get('items', id)).toMatchObject({ ok: false, error: { code: ErrorCode.InvalidId } });
  });

  it('컬렉션 이름의 경로 이탈도 거부한다', async () => {
    expect(await store.put('../out', 'a', 1)).toMatchObject({ ok: false, error: { code: ErrorCode.InvalidId } });
  });
});
