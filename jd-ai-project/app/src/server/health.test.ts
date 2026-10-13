import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { FakeLlmClient } from './infra/llm/FakeLlmClient';

describe('GET /api/health', () => {
  it('ok를 반환한다', async () => {
    const app = createApp({ llm: new FakeLlmClient([]), seedDir: 'seed' });
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', mode: 'live' });
  });
});
