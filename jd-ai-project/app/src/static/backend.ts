import { createCoreApp } from '../server/core';
import { embeddedSource } from './embedded';
import type { Recordings } from './recording';
import { StaticLlm } from './staticLlm';

export type ApiBackend = (path: string, init: RequestInit) => Promise<Response>;

/**
 * 아티팩트 안에서 서버 역할을 하는 백엔드.
 * 서버와 똑같은 라우팅·검증·도구 코드(createCoreApp)를 브라우저에서 돌리고, 데이터는 페이지에 내장한 것을 쓴다.
 */
export function createStaticBackend(rec: Recordings): ApiBackend {
  const llm = new StaticLlm(rec);
  const app = createCoreApp({
    llm,
    source: embeddedSource,
    mode: 'artifact',
    wrapTool: async (signal, next) => {
      llm.signal = signal;
      llm.sources = new Set();
      await next();
    },
  });

  return async (path, init) => {
    const res = await app.request(path, init);
    const isFullTool = init.method === 'POST' && path.startsWith('/api/tools/') && !path.endsWith('/preview');
    if (!isFullTool || !res.ok) return res;
    // AI 결과가 미리 실행한 기록인지, 지금 Claude가 만든 것인지 화면에 알려준다
    const data = (await res.json()) as Record<string, unknown>;
    data._meta = { source: llm.sources.has('live') ? 'live' : 'recorded', recorded_at: rec.recorded_at };
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}
