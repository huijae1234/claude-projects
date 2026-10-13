import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { ClaudeAgentLlmClient } from './infra/llm/ClaudeAgentLlmClient';

const SEED_DIR = fileURLToPath(new URL('../../seed', import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const app = createApp({ llm: new ClaudeAgentLlmClient(process.env.CLAUDE_MODEL), seedDir: SEED_DIR });

serve({ fetch: app.fetch, port }, () => console.log(`server: http://localhost:${port}`));
