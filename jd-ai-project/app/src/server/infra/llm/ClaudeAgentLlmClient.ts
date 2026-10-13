import { query } from '@anthropic-ai/claude-agent-sdk';
import type { LlmClient, LlmRequest } from '../../application/llm';
import { currentRequestSignal } from '../../application/requestContext';
import { type AppError, ErrorCode, type Result, err, ok } from '../../../shared/result';

/**
 * 로컬에 로그인된 Claude 인증을 Agent SDK로 호출한다 (API 키 불필요).
 * 전역 CLAUDE.md·훅·도구가 섞이지 않도록 settingSources/tools를 비운 순수 텍스트 호출.
 */
export class ClaudeAgentLlmClient implements LlmClient {
  /** 응답이 이 시간 안에 안 오면 호출을 중단하고 오류로 알린다 (화면이 무한 로딩되지 않도록). */
  constructor(
    private readonly model?: string,
    private readonly timeoutMs = 150_000,
  ) {}

  async complete(req: LlmRequest): Promise<Result<unknown, AppError>> {
    const requestSignal = currentRequestSignal();
    if (requestSignal?.aborted) return err(ErrorCode.LlmCallFailed, '요청이 취소되어 Claude를 호출하지 않았습니다.');

    const abortController = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abortController.abort();
    }, this.timeoutMs);
    const onRequestAbort = () => abortController.abort();
    requestSignal?.addEventListener('abort', onRequestAbort, { once: true });
    try {
      const stream = query({
        prompt: req.prompt,
        options: {
          systemPrompt: req.system ?? '',
          settingSources: [],
          tools: [],
          maxTurns: 3,
          model: this.model,
          abortController,
          outputFormat: { type: 'json_schema', schema: req.jsonSchema },
        },
      });

      for await (const msg of stream) {
        if (msg.type !== 'result') continue;
        if (msg.subtype === 'success') {
          if (msg.is_error) {
            return err(ErrorCode.LlmCallFailed, `Claude 호출 실패: ${msg.result}`);
          }
          if (msg.structured_output === undefined) {
            return err(ErrorCode.LlmInvalidOutput, '구조화된 출력이 비어 있습니다');
          }
          return ok(msg.structured_output);
        }
        return err(ErrorCode.LlmCallFailed, `Claude 호출 실패: ${msg.subtype}`);
      }
      return err(ErrorCode.LlmCallFailed, 'Claude 응답이 없습니다');
    } catch (e) {
      if (abortController.signal.aborted) {
        return err(
          ErrorCode.LlmCallFailed,
          timedOut ? `Claude 응답이 ${this.timeoutMs / 1000}초 안에 오지 않아 중단했습니다. 잠시 뒤 다시 시도하세요.` : '요청이 취소되어 Claude 호출을 중단했습니다.',
        );
      }
      return err(ErrorCode.LlmCallFailed, `Claude 호출 예외: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      clearTimeout(timer);
      requestSignal?.removeEventListener('abort', onRequestAbort);
    }
  }
}
