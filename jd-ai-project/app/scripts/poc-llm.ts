import { z } from 'zod';
import { generateStructured } from '../src/server/application/llm';
import { ClaudeAgentLlmClient } from '../src/server/infra/llm/ClaudeAgentLlmClient';

const Schema = z.object({
  hazards: z
    .array(z.object({ name: z.string(), reason: z.string() }))
    .length(2)
    .describe('즉석 라면 제조에서 흔한 품질 위해 요소 2개'),
});

const started = Date.now();
const result = await generateStructured(new ClaudeAgentLlmClient(), {
  system: '당신은 식품 품질관리 전문가입니다. 한국어로 간결히 답하세요.',
  prompt: '즉석 라면 제조 공정에서 흔한 품질 위해 요소 2개와 이유를 알려주세요.',
  schema: Schema,
});

console.log(`소요: ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
