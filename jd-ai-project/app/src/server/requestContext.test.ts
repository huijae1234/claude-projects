import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import type { LlmClient, LlmRequest } from './application/llm';
import { currentRequestSignal } from './application/requestContext';
import { ok } from '../shared/result';

/** 요청 컨텍스트의 중단 신호를 보고, 취소되면 멈추는 가짜 LLM (Claude 클라이언트와 같은 방식) */
class SignalAwareLlm implements LlmClient {
  sawSignal = false;
  aborted = false;
  async complete(_req: LlmRequest) {
    const signal = currentRequestSignal();
    this.sawSignal = signal !== undefined;
    await new Promise<void>((resolve) => {
      if (!signal) return resolve();
      if (signal.aborted) return resolve();
      signal.addEventListener('abort', () => resolve(), { once: true });
      setTimeout(resolve, 2000); // 취소가 안 오면 2초 뒤 끝남
    });
    this.aborted = signal?.aborted ?? false;
    return ok({ is_claim: false, category: 'other', severity: 'inquiry', severity_reason: '테스트', health_risk: false, immediate_actions: [], investigation_items: [], report_to_authority: false, reply_draft: '테스트 회신' });
  }
}

describe('요청 취소가 LLM 호출까지 전달된다', () => {
  it('도구 요청 중 LLM은 그 요청의 중단 신호를 볼 수 있다', async () => {
    const llm = new SignalAwareLlm();
    const app = createApp({ llm, seedDir: 'seed' });
    const ctrl = new AbortController();
    const pending = Promise.resolve(app.request('/api/tools/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ claim_id: 'CL-008' }),
      signal: ctrl.signal,
    }));
    await new Promise((r) => setTimeout(r, 50));
    ctrl.abort();
    await pending.catch(() => undefined);
    expect(llm.sawSignal).toBe(true);
    expect(llm.aborted).toBe(true);
  });

  it('도구가 아닌 경로나 요청 밖에서는 신호가 없다', () => {
    expect(currentRequestSignal()).toBeUndefined();
  });
});
