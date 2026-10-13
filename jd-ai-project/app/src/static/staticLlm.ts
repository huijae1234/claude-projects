import type { LlmClient, LlmRequest } from '../server/application/llm';
import { type AppError, ErrorCode, type Result, err, ok } from '../shared/result';
import { type Recordings, requestKey } from './recording';

type SampleFn = {
  json: (input: string, opts?: { signal?: AbortSignal; modelTier?: 'default' | 'quick' | 'complex' }) => Promise<unknown>;
};

let samplePromise: Promise<SampleFn | null> | null = null;
/** 아티팩트 뷰어가 주는 Claude 호출 기능. 없거나 쓸 수 없는 환경이면 null */
export function getSample(): Promise<SampleFn | null> {
  if (!samplePromise) {
    const c = (globalThis as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
    samplePromise = c?.use ? (c.use('sample') as Promise<SampleFn | null>).catch(() => null) : Promise.resolve(null);
  }
  return samplePromise;
}

/** 테스트용: 한 번 정한 sample 사용 가능 여부를 다시 확인하게 한다 */
export const resetSampleForTests = () => {
  samplePromise = null;
};

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });

const NOT_RECORDED =
  '[안내] 이 입력은 미리 실행해 둔 결과가 없습니다. 이 링크에서는 샘플 입력의 결과를 바로 볼 수 있고, 직접 입력한 내용은 Claude 사용을 허용한 경우에만 분석됩니다.';

const SAMPLE_ERRORS: Record<string, string> = {
  not_granted: '[안내] Claude 사용을 허용하지 않아 이 입력은 분석하지 않았습니다. 샘플 입력은 미리 실행한 결과로 볼 수 있습니다.',
  sampling_disabled: '이 계정에서는 Claude 호출을 쓸 수 없습니다. 샘플 입력은 미리 실행한 결과로 볼 수 있습니다.',
  rate_limited: 'Claude 호출이 잠시 너무 많습니다. 조금 뒤에 다시 시도하세요.',
  session_expired: 'Claude 로그인이 만료되었습니다. 다시 로그인한 뒤 시도하세요.',
  refused: 'Claude가 이 입력에 답하지 않았습니다. 내용을 바꿔서 다시 시도하세요.',
  invalid_json: 'Claude 응답을 결과 형식으로 읽지 못했습니다. 다시 시도하세요.',
  prompt_too_large: '입력이 너무 깁니다. 데이터를 줄여서 다시 시도하세요.',
  cancelled: '취소했습니다.',
};

/**
 * 아티팩트용 LLM: 미리 실행해 둔 질문이면 기록된 실제 응답을 돌려주고,
 * 처음 보는 질문(직접 입력)이면 뷰어의 Claude(sample)로 그 자리에서 묻는다.
 */
export class StaticLlm implements LlmClient {
  /** 지금 처리 중인 요청의 취소 신호와, 응답이 어디서 왔는지 */
  signal?: AbortSignal;
  sources = new Set<'recorded' | 'live'>();

  constructor(private readonly rec: Recordings) {}

  async complete(req: LlmRequest): Promise<Result<unknown, AppError>> {
    const key = requestKey(req);
    if (key in this.rec.entries) {
      await wait(500, this.signal); // 결과가 "나오는" 흐름이 보이도록 아주 잠깐 기다린다
      this.sources.add('recorded');
      return ok(this.rec.entries[key]);
    }
    const sample = await getSample();
    if (!sample) return err(ErrorCode.LlmCallFailed, NOT_RECORDED);
    const prompt =
      `${req.system ?? ''}\n\n${req.prompt}\n\n` +
      `[출력 형식] 아래 JSON 스키마를 만족하는 JSON 객체 하나만 출력하세요. 다른 설명이나 코드 블록 없이 JSON만.\n${JSON.stringify(req.jsonSchema)}`;
    try {
      const value = await sample.json(prompt, { signal: this.signal, modelTier: 'default' });
      this.sources.add('live');
      return ok(value);
    } catch (e) {
      const code = (e as { code?: string })?.code ?? 'upstream_error';
      return err(ErrorCode.LlmCallFailed, SAMPLE_ERRORS[code] ?? `Claude 호출 중 문제가 생겼습니다(${code}). 잠시 뒤 다시 시도하세요.`);
    }
  }
}
