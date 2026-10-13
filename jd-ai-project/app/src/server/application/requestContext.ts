import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * 지금 처리 중인 HTTP 요청의 중단 신호.
 * 화면에서 "취소"하거나 연결이 끊기면 이 신호가 켜지고, LLM 호출도 함께 멈춘다.
 * (도구 함수마다 signal 인자를 넘기지 않도록 요청 단위 컨텍스트로 전달한다)
 */
const store = new AsyncLocalStorage<AbortSignal>();

export const withRequestSignal = <T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T> => store.run(signal, fn);

export const currentRequestSignal = (): AbortSignal | undefined => store.getStore();
