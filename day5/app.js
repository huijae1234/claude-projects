// 이벤트 연결 · 상태 · 저장. 판단은 rules.js, 그리기는 render.js, 개그는 api.js.
import { LIMITS, startBreak, showJoke, endEarly, breakStatus, canShowNext, returnSignal, summarizeBreak, recordBreak, durationLabel } from './rules.js';
import { drawJokes, loadTranslations } from './api.js';
import { renderIdle, renderLoading, renderError, renderBreak, updateClock, renderSource } from './render.js';

const params = new URLSearchParams(location.search);
const FIXTURE = params.get('fixture') === '1';
const SEED = Number(params.get('seed')) || 1;
const SEC = Number(params.get('sec'));
const limits = SEC > 0 ? { ...LIMITS, breakSeconds: SEC } : LIMITS; // ?sec=10 처럼 짧게 시험해 볼 수 있다

const root = document.getElementById('app');
const sourceEl = document.getElementById('source');

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`day5:${key}`);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`day5:${key}`, JSON.stringify(value)); } catch { /* 저장 실패는 무시 */ }
  },
};

const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const now = () => Date.now();

const app = {
  translations: {},
  koOnly: store.get('koOnly', true),
  task: store.get('task', ''),
  history: store.get('history', null),
  deckPromise: null,
  deck: null,
  state: null,
  revealed: false,
  showKo: true,
  recorded: false,
  timer: null,
};

function prefetch() {
  renderSource(sourceEl, { mode: 'pending' });
  app.deckPromise = drawJokes({
    fixture: FIXTURE, koOnly: app.koOnly, seed: SEED, translations: app.translations, count: limits.maxJokes,
  }).then((deck) => {
    renderSource(sourceEl, deck);
    return deck;
  });
  app.deckPromise.catch(() => renderSource(sourceEl, { mode: 'fallback' }));
}

function idle() {
  clearInterval(app.timer);
  app.state = null;
  renderIdle(root, { task: app.task, history: app.history, koOnly: app.koOnly, breakLabel: durationLabel(limits.breakSeconds), maxJokes: limits.maxJokes });
}

function view() {
  const t = now();
  const status = breakStatus(app.state, t, limits);
  const signal = returnSignal(app.state, t, limits);
  const joke = app.deck.jokes[app.state.jokesShown - 1];
  // 시간 끝·스스로 끝냄이면 개그를 치우고, 개그를 다 본 경우엔 마지막 개그를 남겨 둔다
  const jokeVisible = !!joke && (status.phase === 'resting' || status.phase === 'endedByCount');
  return {
    status, total: limits.breakSeconds, joke, translation: joke ? app.translations[joke.id] : null,
    index: app.state.jokesShown, max: limits.maxJokes,
    revealed: app.revealed || status.phase === 'endedByCount',
    showKo: app.showKo, canNext: canShowNext(app.state, t, limits), signal, jokeVisible,
  };
}

function finishIfEnded() {
  const status = breakStatus(app.state, now(), limits);
  if (status.phase === 'resting') return false;
  clearInterval(app.timer);
  if (!app.recorded) {
    app.recorded = true;
    app.history = recordBreak(app.history, summarizeBreak(app.state, now(), limits), todayStr());
    store.set('history', app.history);
  }
  renderBreak(root, view());
  return true;
}

function tick() {
  if (finishIfEnded()) return;
  const status = breakStatus(app.state, now(), limits);
  updateClock(root, status.remainingSec, limits.breakSeconds);
}

async function start() {
  const input = document.getElementById('task');
  app.task = input ? input.value.trim() : app.task;
  store.set('task', app.task);
  renderLoading(root);
  try {
    app.deck = await app.deckPromise;
  } catch {
    renderError(root, '개그를 불러오지 못했어요. 새로고침해 주세요.');
    return;
  }
  app.state = showJoke(startBreak(now(), app.task), now(), limits);
  app.revealed = false;
  app.showKo = true;
  app.recorded = false;
  renderBreak(root, view());
  clearInterval(app.timer);
  app.timer = setInterval(tick, 250);
}

function back() {
  idle();
  prefetch();
}

root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (action === 'start') start();
  else if (action === 'back') back();
  else if (action === 'reveal') { app.revealed = true; renderBreak(root, view()); }
  else if (action === 'toggle-ko') { app.showKo = !app.showKo; renderBreak(root, view()); }
  else if (action === 'next') {
    app.state = showJoke(app.state, now(), limits);
    app.revealed = false;
    if (!finishIfEnded()) renderBreak(root, view());
  } else if (action === 'finish') {
    app.state = endEarly(app.state, now(), limits);
    finishIfEnded();
  }
});

root.addEventListener('change', (e) => {
  if (e.target.dataset.action === 'toggle-ko-only') {
    app.koOnly = e.target.checked;
    store.set('koOnly', app.koOnly);
    prefetch();
  }
});

(async function init() {
  app.translations = await loadTranslations();
  idle();
  prefetch();
})();
