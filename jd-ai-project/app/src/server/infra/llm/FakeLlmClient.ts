import type { LlmClient, LlmRequest } from '../../application/llm';
import { type AppError, type Result, ok } from '../../../shared/result';

/** 테스트용. 미리 넣어 둔 응답을 순서대로 돌려주고, 받은 요청을 기록한다. */
export class FakeLlmClient implements LlmClient {
  readonly calls: LlmRequest[] = [];
  private readonly queue: Result<unknown, AppError>[];

  constructor(responses: Array<Result<unknown, AppError> | unknown>) {
    this.queue = responses.map((r) =>
      typeof r === 'object' && r !== null && 'ok' in r ? (r as Result<unknown, AppError>) : ok(r),
    );
  }

  async complete(req: LlmRequest): Promise<Result<unknown, AppError>> {
    this.calls.push(req);
    const next = this.queue.shift();
    if (!next) throw new Error('FakeLlmClient: 준비된 응답이 없습니다');
    return next;
  }
}
