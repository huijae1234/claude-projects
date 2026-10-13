// 두 API 호출: Dog CEO(사진), 위키백과 한국어(설명). 실시간 ↔ 고정 파일.
// 쓰는 필드: Dog CEO `message`, 위키 `title, extract, type, thumbnail, content_urls`.

const DOG_BASE = 'https://dog.ceo/api/breed';
const WIKI_BASE = 'https://ko.wikipedia.org/api/rest_v1/page/summary';
const TIMEOUT_MS = 8000;
const RETRY_WAIT_MS = 1500; // 위키가 429(요청 많음)를 주면 잠깐 기다렸다 한 번만 다시

async function getJson(url, { timeoutMs = TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// 고정 파일 (실제 응답 사본). 처음 필요할 때 한 번만 읽는다.
const fixtureCache = {};
function fixture(name) {
  fixtureCache[name] ??= getJson(`fixtures/${name}.json`, { timeoutMs: 5000 });
  return fixtureCache[name];
}

const toArray = (message) => (Array.isArray(message) ? message : message ? [message] : []);

/**
 * 품종 사진 주소들. 반환: { urls, mode }
 *  mode: live | fixture(?fixture=1) | fallback(실시간 실패 → 고정 파일)
 */
export async function fetchImages(key, n, { fixture: useFixture } = {}) {
  const fromFixture = async (mode) => {
    const all = await fixture('dog-images');
    return { urls: toArray(all[key]?.message).slice(0, n), mode };
  };
  if (useFixture) return fromFixture('fixture');
  try {
    const data = await getJson(`${DOG_BASE}/${key}/images/random/${n}`);
    const urls = toArray(data.message).slice(0, n);
    if (!urls.length) throw new Error('사진 없음');
    return { urls, mode: 'live' };
  } catch {
    return fromFixture('fallback');
  }
}

const memory = new Map();
const sessionKey = (title) => `day6:wiki:${title}`;

function readSession(title) {
  try {
    const raw = sessionStorage.getItem(sessionKey(title));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeSession(title, summary) {
  try { sessionStorage.setItem(sessionKey(title), JSON.stringify(summary)); } catch { /* 저장 실패는 무시 */ }
}

/**
 * 위키 한국어 요약. 반환: { summary|null, mode }
 * 같은 제목은 캐시한다(메모리 + sessionStorage). 429면 한 번만 재시도하고, 그래도 안 되면 고정 파일.
 */
export async function fetchSummary(title, { fixture: useFixture } = {}) {
  const fromFixture = async (mode) => {
    const all = await fixture('wiki-summaries');
    return { summary: all[title] ?? null, mode };
  };
  if (useFixture) return fromFixture('fixture');

  if (memory.has(title)) return { summary: memory.get(title), mode: 'live' };
  const cached = readSession(title);
  if (cached) {
    memory.set(title, cached);
    return { summary: cached, mode: 'live' };
  }
  const url = `${WIKI_BASE}/${encodeURIComponent(title)}`;
  try {
    let data;
    try {
      data = await getJson(url);
    } catch (err) {
      if (err.status !== 429) throw err;
      await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
      data = await getJson(url);
    }
    memory.set(title, data);
    writeSession(title, data);
    return { summary: data, mode: 'live' };
  } catch {
    return fromFixture('fallback');
  }
}

/* ---------- AI(NVIDIA): 키는 서버(server.py)만 안다. 브라우저는 우리 서버의 /api/* 만 부른다 ---------- */

const AI_TIMEOUT_MS = 100000; // 서버가 한 번 재시도할 수도 있어서 넉넉히

async function postJson(path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    return data ?? { ok: false, message: '서버 응답을 읽지 못했어요.' };
  } catch {
    return { ok: false, message: '서버에 연결하지 못했어요. 잠시 뒤에 다시 해 주세요.' };
  } finally {
    clearTimeout(timer);
  }
}

/** 반환: { ok, answer, model, mode:'live'|'cache'|'fixture' } 또는 { ok:false, message } */
export const askAi = (breedKey, question, { fixture } = {}) =>
  postJson('/api/ask', { breedKey, question, fixture: !!fixture });

export const simplifyText = (breedKey, { fixture } = {}) =>
  postJson('/api/simplify', { breedKey, fixture: !!fixture });

/** 서버가 AI를 쓸 수 있는지 (키 값은 오지 않는다). 서버가 없으면 { ai:false } */
export async function loadAiStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error('no status');
    return await res.json();
  } catch {
    return { ai: false, models: null };
  }
}

/** 챗봇: 품종을 고르지 않고 말로 묻는다. 반환: { ok, answer, sources:[{key,ko,score}], offtopic?, mode } 또는 { ok:false, message } */
export const chatAsk = (question, { fixture } = {}) =>
  postJson('/api/chat', { question, fixture: !!fixture });
