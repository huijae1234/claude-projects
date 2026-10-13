export const ErrorCode = {
  Validation: 'VALIDATION',
  LlmCallFailed: 'LLM_CALL_FAILED',
  LlmInvalidOutput: 'LLM_INVALID_OUTPUT',
  NotFound: 'NOT_FOUND',
  InvalidId: 'INVALID_ID',
  Storage: 'STORAGE_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface AppError {
  code: ErrorCode;
  message: string;
}

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = (code: ErrorCode, message: string): Result<never, AppError> => ({
  ok: false,
  error: { code, message },
});
