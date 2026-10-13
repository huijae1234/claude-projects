import { z } from 'zod';
import { type AppError, ErrorCode, type Result, err, ok } from '../../shared/result';

export interface LlmRequest {
  system?: string;
  prompt: string;
  jsonSchema: Record<string, unknown>;
}

/** LLM 호출 포트. 구현체는 infra에 둔다. 반환값은 아직 검증되지 않은 JSON. */
export interface LlmClient {
  complete(req: LlmRequest): Promise<Result<unknown, AppError>>;
}

export interface StructuredRequest<T> {
  system?: string;
  prompt: string;
  schema: z.ZodType<T>;
}

/** 모델이 형식만 맞추고 내용을 비운 응답("placeholder" 등)을 찾는다. 찾으면 그 값을, 없으면 null. */
export function findPlaceholder(value: unknown): string | null {
  const bad = /^(placeholder|lorem ipsum|tbd|string)$/i;
  if (typeof value === 'string') return bad.test(value.trim()) ? value : null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const f = findPlaceholder(v);
      if (f) return f;
    }
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) {
      const f = findPlaceholder(v);
      if (f) return f;
    }
  }
  return null;
}

/**
 * 스키마에 맞는 출력을 받는다. 스키마 불일치 시 오류 내용을 붙여 1회만 재시도한다.
 * 호출 자체가 실패한 경우는 재시도하지 않는다.
 */
export async function generateStructured<T>(
  client: LlmClient,
  req: StructuredRequest<T>,
): Promise<Result<T, AppError>> {
  const jsonSchema = z.toJSONSchema(req.schema) as Record<string, unknown>;
  delete jsonSchema.$schema; // Claude CLI가 $schema 키를 거부한다

  let prompt = req.prompt;
  let lastIssue = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const called = await client.complete({ system: req.system, prompt, jsonSchema });
    if (!called.ok) return called;

    const parsed = req.schema.safeParse(called.value);
    if (parsed.success) {
      const empty = findPlaceholder(parsed.data);
      if (empty === null) return ok(parsed.data);
      lastIssue = `"${empty}" 같은 자리표시 값이 들어 있습니다. 실제 분석 내용으로 채우세요.`;
    } else {
      lastIssue = z.prettifyError(parsed.error);
    }
    prompt = `${req.prompt}\n\n[이전 응답이 스키마에 맞지 않았습니다. 아래 오류를 고쳐 다시 응답하세요]\n${lastIssue}`;
  }
  return err(ErrorCode.LlmInvalidOutput, `스키마 검증 실패: ${lastIssue}`);
}
