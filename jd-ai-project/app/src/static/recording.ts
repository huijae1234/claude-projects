import type { LlmRequest } from '../server/application/llm';
import { hash53 } from '../shared/hash';

/**
 * LLM 요청의 지문. 같은 입력이면 도구가 같은 질문(시스템·프롬프트·스키마)을 만들므로,
 * 미리 실행해 둔 응답을 이 지문으로 다시 찾을 수 있다.
 */
export const requestKey = (req: LlmRequest): string =>
  hash53(`${req.system ?? ''}\u0000${req.prompt}\u0000${JSON.stringify(req.jsonSchema)}`);

export interface Recordings {
  recorded_at: string;
  /** 지문 → Claude 응답(JSON) */
  entries: Record<string, unknown>;
  jobs: Array<{ id: string; status: number; seconds: number }>;
}
