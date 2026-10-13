// api.js — 공휴일 가져오기. 실시간(Nager.Date)과 고정 파일(fixtures/)을 전환한다.
// API가 하는 일은 "어느 날이 쉬는 날인가" 하나뿐이다. 판단은 rules.js가 한다.
(function (root) {
  'use strict';

  const LIVE_URL = (year) => 'https://date.nager.at/api/v3/PublicHolidays/' + year + '/KR';
  const FIXTURE_URL = (year) => 'fixtures/holidays-' + year + '-KR.json';
  const CACHE_KEY = (year) => 'maegam.holidays.' + year;
  const CACHE_MS = 24 * 3600 * 1000; // 실시간으로 받은 값은 하루 동안 다시 쓴다

  async function getJson(url, timeoutMs) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function readCache(year) {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY(year)) || 'null');
      if (c && Date.now() - c.at < CACHE_MS && Array.isArray(c.data)) return c;
    } catch (e) { /* 저장소를 못 쓰는 환경이면 그냥 건너뛴다 */ }
    return null;
  }
  function writeCache(year, data) {
    try { localStorage.setItem(CACHE_KEY(year), JSON.stringify({ at: Date.now(), data })); } catch (e) { /* 무시 */ }
  }

  // 한 해치를 가져온다. 돌려주는 값: { year, list, source: 'live'|'cache'|'fixture'|'none', at, note }
  async function loadYear(year, opts) {
    const useFixture = opts && opts.fixture;
    if (!useFixture) {
      const cached = readCache(year);
      if (cached) return { year, list: cached.data, source: 'cache', at: cached.at, note: '' };
      try {
        const list = await getJson(LIVE_URL(year), 6000);
        writeCache(year, list);
        return { year, list, source: 'live', at: Date.now(), note: '' };
      } catch (e) {
        // 실시간이 안 되면 고정 파일로 대신한다(그리고 그 사실을 화면에 알린다).
        try {
          const list = await getJson(FIXTURE_URL(year), 4000);
          return { year, list, source: 'fixture', at: Date.now(), note: '실시간 조회에 실패해 고정 파일로 대신했습니다.' };
        } catch (e2) {
          return { year, list: [], source: 'none', at: Date.now(), note: year + '년 공휴일 데이터를 가져오지 못해 주말만 쉬는 날로 계산했습니다.' };
        }
      }
    }
    try {
      const list = await getJson(FIXTURE_URL(year), 4000);
      return { year, list, source: 'fixture', at: Date.now(), note: '' };
    } catch (e) {
      return { year, list: [], source: 'none', at: Date.now(), note: year + '년 고정 파일이 없어 주말만 쉬는 날로 계산했습니다.' };
    }
  }

  // 여러 해를 한꺼번에 가져온다. { list(합친 목록), sources: [...], notes: [...] }
  async function loadHolidays(years, opts) {
    const results = await Promise.all(years.map((y) => loadYear(y, opts)));
    return {
      list: results.flatMap((r) => r.list),
      sources: results.map((r) => ({ year: r.year, source: r.source, at: r.at })),
      notes: results.map((r) => r.note).filter(Boolean)
    };
  }

  root.Api = { loadHolidays, loadYear };
})(typeof window !== 'undefined' ? window : globalThis);
