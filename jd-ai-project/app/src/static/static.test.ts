import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { fileDataSource } from '../server/app';
import { buildJobs } from './jobs';
import { createStaticBackend } from './backend';
import { embeddedSource } from './embedded';
import recordings from './recordings.json';
import type { Recordings } from './recording';
import { resetSampleForTests } from './staticLlm';

const rec = recordings as unknown as Recordings;
const post = (be: ReturnType<typeof createStaticBackend>, path: string, body: unknown) =>
  be(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

afterEach(() => {
  delete (globalThis as { claude?: unknown }).claude;
  resetSampleForTests();
});

describe('아티팩트에 내장한 데이터는 서버의 파일 데이터와 같다 (같아야 같은 질문이 나온다)', () => {
  const files = fileDataSource(fileURLToPath(new URL('../../seed', import.meta.url)));
  it('시드 JSON 6종과 CSV 5종이 일치한다', async () => {
    for (const k of ['products', 'regulations', 'claims', 'ncrMemos', 'suppliers', 'supplierCases'] as const) {
      expect(await embeddedSource[k](), k).toEqual(await files[k]());
    }
    expect(await embeddedSource.productionCsv()).toBe(await files.productionCsv());
    for (const n of ['production_dairy_meat.csv', 'equipment_dairy_meat.csv', 'inspection_dairy_meat.csv', 'hygiene_audits.csv']) {
      expect(await embeddedSource.sample(n), n).toBe(await files.sample(n));
    }
  });
});

describe('미리 실행한 기록: 화면에서 고를 수 있는 모든 샘플 입력이 기록과 맞아떨어진다', () => {
  it('요청 목록이 비어 있지 않고 기록 파일의 모든 요청이 성공(200)이었다', async () => {
    const jobs = await buildJobs(embeddedSource);
    expect(jobs.length).toBeGreaterThanOrEqual(30);
    expect(rec.jobs).toHaveLength(jobs.length);
    expect(rec.jobs.filter((j) => j.status !== 200)).toEqual([]);
  });

  it('모든 요청을 브라우저용 백엔드로 보내면 전부 200이고 전부 "기록"에서 나온다 (Claude를 새로 부르지 않는다)', async () => {
    const be = createStaticBackend(rec);
    const jobs = await buildJobs(embeddedSource);
    const bad: string[] = [];
    for (const job of jobs) {
      const res = await post(be, job.path, job.body);
      const json = (await res.json()) as { _meta?: { source: string }; error?: { message: string } };
      if (res.status !== 200 || json._meta?.source !== 'recorded') bad.push(`${job.id} → ${res.status} ${json.error?.message ?? json._meta?.source}`);
    }
    expect(bad).toEqual([]);
  }, 90_000); // 기록 응답마다 연출용 대기(0.5초)가 있어 33건이면 기본 5초를 넘는다

  it('결과가 서버 응답과 같은 모양이다 (인용 검증 결과 포함)', async () => {
    const be = createStaticBackend(rec);
    const jobs = await buildJobs(embeddedSource);
    const ncr = jobs.find((j) => j.id.startsWith('ncr:NM-001'))!;
    const json = (await (await post(be, ncr.path, ncr.body)).json()) as { facts: Array<{ verified: boolean }>; unverified_facts: number };
    expect(json.facts.length).toBeGreaterThan(0);
    expect(json.unverified_facts).toBe(json.facts.filter((f) => !f.verified).length);
  });
});

describe('기록에 없는 입력', () => {
  it('Claude 호출 기능이 없으면 이유를 알려 준다 (502, 안내 문구)', async () => {
    const be = createStaticBackend(rec);
    const res = await post(be, '/api/tools/claim', { text: '과자에서 유리 조각이 나왔어요' });
    expect(res.status).toBe(502);
    const msg = ((await res.json()) as { error: { message: string } }).error.message;
    expect(msg).toContain('미리 실행해 둔 결과가 없습니다');
    expect(msg.startsWith('[안내] ')).toBe(true); // 화면에서 오류가 아닌 안내로 보이게 하는 표시
  });

  it('코드 계산(미리보기)은 기록과 무관하게 항상 동작한다', async () => {
    const be = createStaticBackend(rec);
    const csv = 'date,product,test_item,value\n' + Array.from({ length: 30 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')},우유,산도,0.15`).join('\n');
    const res = await post(be, '/api/tools/inspection/preview', { csv });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { analysis: { series: unknown[] } }).analysis.series).toHaveLength(1);
  });

  it('뷰어의 Claude(sample)가 있으면 그 자리에서 분석하고 "live"로 표시한다', async () => {
    let asked = 0;
    (globalThis as { claude?: unknown }).claude = {
      use: async (n: string) =>
        n === 'sample'
          ? {
              json: async () => {
                asked += 1;
                return { is_claim: true, category: 'foreign_matter', severity: 'critical', severity_reason: '유리 이물', health_risk: true, immediate_actions: ['회수'], investigation_items: ['로트 확인'], report_to_authority: true, reply_draft: '죄송합니다. 확인 후 안내드리겠습니다.' };
              },
            }
          : null,
    };
    const be = createStaticBackend(rec);
    const res = await post(be, '/api/tools/claim', { text: '과자에서 유리 조각이 나왔어요' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { severity: string; _meta: { source: string } };
    expect(json.severity).toBe('critical');
    expect(json._meta.source).toBe('live');
    expect(asked).toBe(1);
  });

  it('뷰어가 Claude 사용을 허용하지 않으면(not_granted) 친절한 안내로 끝난다', async () => {
    (globalThis as { claude?: unknown }).claude = {
      use: async () => ({ json: async () => Promise.reject({ code: 'not_granted', message: 'x' }) }),
    };
    const be = createStaticBackend(rec);
    const res = await post(be, '/api/tools/claim', { text: '과자에서 유리 조각이 나왔어요' });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain('허용하지 않아');
  });
});
