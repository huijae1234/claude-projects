// 개그 가져오기. 실시간(JokeAPI) 또는 고정 파일(fixtures/).
// 응답에서 쓰는 것은 id, type, joke/setup/delivery, category, lang 뿐이다.

const LIVE_BASE = 'https://v2.jokeapi.dev/joke';
const CATEGORIES = 'Programming,Misc,Pun'; // 가벼운 것만 (Dark·Spooky 제외)
const FIXTURE_FILES = ['fixtures/jokes-raw-1.json', 'fixtures/jokes-raw-2.json'];
const TRANSLATION_FILE = 'fixtures/ko-translations.json';
const LIVE_TIMEOUT_MS = 8000;

/** 원본 응답의 개그 하나 -> 화면에서 쓰는 모양. 안전하지 않으면 null. */
export function normalizeJoke(raw) {
  if (!raw || raw.error || raw.safe !== true) return null;
  const base = { id: raw.id, type: raw.type, category: raw.category, lang: raw.lang };
  if (raw.type === 'single' && raw.joke) return { ...base, joke: raw.joke };
  if (raw.type === 'twopart' && raw.setup && raw.delivery) return { ...base, setup: raw.setup, delivery: raw.delivery };
  return null;
}

/** seed가 같으면 항상 같은 순서. (mulberry32) */
export function seededOrder(list, seed = 1) {
  let a = (Number(seed) || 1) >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function getJson(url, timeoutMs = LIVE_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** { "10": {setup, delivery, note}, ... } — 못 읽으면 빈 객체 */
export async function loadTranslations() {
  try {
    const data = await getJson(TRANSLATION_FILE, 4000);
    return data.translations ?? {};
  } catch {
    return {};
  }
}

/** 고정 파일의 개그 (id 중복 제거) */
export async function loadFixtureJokes() {
  const byId = new Map();
  for (const file of FIXTURE_FILES) {
    const data = await getJson(file, 4000);
    for (const raw of data.jokes ?? []) {
      const j = normalizeJoke(raw);
      if (j && !byId.has(j.id)) byId.set(j.id, j);
    }
  }
  return [...byId.values()];
}

async function fixtureDeck({ koOnly, seed, translations, count }) {
  let pool = await loadFixtureJokes();
  if (koOnly) {
    const withKo = pool.filter((j) => translations[j.id]);
    if (withKo.length >= count) pool = withKo;
  }
  return seededOrder(pool, seed).slice(0, count);
}

async function liveDeck({ koOnly, translations, count }) {
  const ids = Object.keys(translations);
  if (koOnly && ids.length >= count) {
    // 번역이 있는 개그를 id로 한 개씩 받는다.
    const picked = seededOrder(ids, Math.floor(Math.random() * 1e9)).slice(0, count);
    const raws = await Promise.all(picked.map((id) => getJson(`${LIVE_BASE}/Any?idRange=${id}&safe-mode`)));
    const jokes = raws.map(normalizeJoke).filter(Boolean);
    if (jokes.length < count) throw new Error('safe 개그가 모자람');
    return jokes;
  }
  const data = await getJson(`${LIVE_BASE}/${CATEGORIES}?safe-mode&amount=${count}`);
  const jokes = (data.jokes ?? []).map(normalizeJoke).filter(Boolean);
  if (jokes.length < count) throw new Error('safe 개그가 모자람');
  return jokes;
}

/**
 * 쉼 한 번에 쓸 개그 묶음을 받아 온다.
 * 반환: { jokes, mode: 'live'|'fixture'|'fallback', fetchedAt }
 *  fixture  = ?fixture=1 로 일부러 고정 파일 사용
 *  fallback = 실시간이 실패해서 고정 파일로 대체
 */
export async function drawJokes({ fixture, koOnly, seed, translations, count }) {
  const opts = { koOnly, seed, translations, count };
  if (fixture) {
    return { jokes: await fixtureDeck(opts), mode: 'fixture', fetchedAt: null };
  }
  try {
    return { jokes: await liveDeck(opts), mode: 'live', fetchedAt: new Date().toISOString() };
  } catch {
    return { jokes: await fixtureDeck(opts), mode: 'fallback', fetchedAt: null };
  }
}
