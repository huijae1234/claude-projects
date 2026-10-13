import { fileURLToPath } from 'node:url';
import { createApp } from '../src/server/app';
import { ClaudeAgentLlmClient } from '../src/server/infra/llm/ClaudeAgentLlmClient';

const app = createApp({ llm: new ClaudeAgentLlmClient(), seedDir: fileURLToPath(new URL('../seed', import.meta.url)) });
const post = async (url: string, body: unknown) => {
  const t = Date.now();
  const res = await app.request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  console.log(`\n=== ${url} ${JSON.stringify(body)} → ${res.status} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  return json;
};

const which = process.argv[2];
if (which === 'production') {
  const j = await post('/api/tools/production', {});
  console.log(JSON.stringify(j.ai ?? j, null, 1));
} else if (which === 'inspection') {
  const j = await post('/api/tools/inspection', {});
  console.log(JSON.stringify(j.ai ?? j, null, 1));
} else if (which === 'supplier') {
  // 사용: live-check.ts supplier SC-002:request_action:5
  for (const spec of (process.argv[3] ?? 'SC-001:request_action:5').split(',')) {
    const [case_id, tone, days] = spec.split(':');
    const j = await post('/api/tools/supplier_report', { case_id, tone, deadline_days: Number(days ?? 5) });
    console.log(JSON.stringify(j, null, 1));
  }
} else if (which === 'ncr') {
  for (const id of (process.argv[3] ?? 'NM-001').split(',')) {
    const j = await post('/api/tools/ncr', { memo_id: id });
    console.log(JSON.stringify(j, null, 1));
  }
} else if (which === 'equipment') {
  const j = await post('/api/tools/equipment', {});
  console.log(JSON.stringify(j.ai ?? j, null, 1));
} else if (which === 'regulation') {
  for (const id of ['R-001', 'R-002']) {
    const j = await post('/api/tools/regulation', { regulation_id: id });
    console.log(JSON.stringify(j, null, 1));
  }
} else {
  for (const id of ['CL-001', 'CL-003', 'CL-008']) {
    const j = await post('/api/tools/claim', { claim_id: id });
    console.log(JSON.stringify(j, null, 1));
  }
}
