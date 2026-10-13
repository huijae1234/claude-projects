/**
 * 아티팩트용 "미리 실행한 실제 Claude 응답"을 기록한다.
 * 실행: npx tsx scripts/record-artifact.ts [--fresh]
 *  - 화면에서 고를 수 있는 샘플 입력마다 실제 Claude로 도구를 한 번 돌리고, 질문 지문 → 응답을 저장한다.
 *  - 이미 기록된 질문은 다시 묻지 않는다(중간에 끊겨도 다시 돌리면 이어서 한다). --fresh면 처음부터.
 * 출력: src/static/recordings.json
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fileDataSource } from '../src/server/app';
import type { LlmClient, LlmRequest } from '../src/server/application/llm';
import { createCoreApp } from '../src/server/core';
import { ClaudeAgentLlmClient } from '../src/server/infra/llm/ClaudeAgentLlmClient';
import { buildJobs } from '../src/static/jobs';
import { type Recordings, requestKey } from '../src/static/recording';
import { ok } from '../src/shared/result';

const OUT = fileURLToPath(new URL('../src/static/recordings.json', import.meta.url));
const SEED = fileURLToPath(new URL('../seed', import.meta.url));
const fresh = process.argv.includes('--fresh');
const CONCURRENCY = 3;

const prev: Recordings | null = !fresh && existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const entries: Record<string, unknown> = { ...(prev?.entries ?? {}) };
const real = new ClaudeAgentLlmClient();
let asked = 0;

const recordingLlm: LlmClient = {
  async complete(req: LlmRequest) {
    const key = requestKey(req);
    if (key in entries) return ok(entries[key]); // 이미 기록된 질문
    asked += 1;
    const r = await real.complete(req);
    if (r.ok) entries[key] = r.value; // 스키마에 안 맞는 응답도 기록: 재생 때 같은 재시도 흐름을 그대로 재현한다
    return r;
  },
};

const source = fileDataSource(SEED);
const app = createCoreApp({ llm: recordingLlm, source });
const jobs = await buildJobs(source);
console.log(`기록할 요청 ${jobs.length}건 (기존 기록 ${Object.keys(entries).length}건 재사용)`);

const results: Recordings['jobs'] = [];
let next = 0;
const save = () =>
  writeFileSync(OUT, JSON.stringify({ recorded_at: new Date().toISOString().slice(0, 10), entries, jobs: results } satisfies Recordings, null, 1) + '\n', 'utf8');

async function worker() {
  while (next < jobs.length) {
    const job = jobs[next++]!;
    const t = Date.now();
    const res = await app.request(job.path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(job.body) });
    const seconds = Math.round((Date.now() - t) / 100) / 10;
    results.push({ id: job.id, status: res.status, seconds });
    const msg = res.status === 200 ? '' : ` ← ${JSON.stringify(await res.json()).slice(0, 160)}`;
    console.log(`${res.status === 200 ? 'OK ' : '!! '} ${job.id.padEnd(40)} ${String(seconds).padStart(5)}초${msg}`);
    save(); // 하나 끝날 때마다 저장해서 중간에 끊겨도 남는다
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
results.sort((a, b) => a.id.localeCompare(b.id));
save();
const failed = results.filter((r) => r.status !== 200);
console.log(`\n완료: ${results.length - failed.length}/${results.length} 성공, 새로 물어본 질문 ${asked}건, 기록 ${Object.keys(entries).length}건`);
if (failed.length) process.exitCode = 1;
