/** 요청을 서버(fetch) 대신 다른 곳(아티팩트 안의 내장 백엔드)으로 보낼 때 쓴다. */
type Backend = (path: string, init: RequestInit) => Promise<Response>;
let backend: Backend | null = null;
export const setApiBackend = (b: Backend) => {
  backend = b;
};

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const init: RequestInit = {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  };
  const res = backend ? await backend(path, init) : await fetch(path, init);
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = typeof data === 'object' && data?.error?.message ? data.error.message : `요청 실패 (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}
