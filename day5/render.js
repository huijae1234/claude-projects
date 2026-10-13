// 그리기 — 규칙이 준 결과를 화면으로 옮길 뿐, 여기서는 판단하지 않는다.
import { formatClock } from './rules.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const fmtMinutes = (sec) => `${Math.round((sec / 60) * 10) / 10}분`;

export function renderIdle(root, { task, history, koOnly, breakLabel, maxJokes }) {
  const stats = history && history.count
    ? `오늘 ${history.count}번 쉬었어요 · 합계 ${fmtMinutes(history.totalSec)} · 평균 ${fmtMinutes(history.totalSec / history.count)}`
    : '오늘은 아직 안 쉬었어요.';
  root.innerHTML = `
    <section class="card idle">
      <label for="task">지금 하던 일 한 줄 <small>(쉼이 끝나면 이걸 보여 줄게요)</small></label>
      <input id="task" type="text" maxlength="60" placeholder="예: 자소서 2번 문항 쓰기" value="${esc(task)}">
      <button class="primary" data-action="start">${esc(breakLabel)} 쉬기 (개그 ${maxJokes}개까지)</button>
      <label class="check"><input type="checkbox" data-action="toggle-ko-only" ${koOnly ? 'checked' : ''}> 한국어 번역이 있는 개그만</label>
      <p class="stats">${esc(stats)}</p>
    </section>`;
}

export function renderLoading(root) {
  root.innerHTML = `<section class="card idle"><p class="loading">개그 고르는 중…</p></section>`;
}

export function renderError(root, message) {
  root.innerHTML = `<section class="card idle"><p class="error">${esc(message)}</p><button class="primary" data-action="back">처음으로</button></section>`;
}

function jokeCard(m) {
  const { joke, translation, index, max, revealed, showKo } = m;
  const twopart = joke.type === 'twopart';
  const en = twopart
    ? `<p class="en">${esc(joke.setup)}</p>${revealed ? `<p class="en delivery">${esc(joke.delivery)}</p>` : `<button data-action="reveal">정답 보기</button>`}`
    : `<p class="en">${esc(joke.joke)}</p>`;

  let ko;
  if (!translation) {
    ko = `<p class="no-ko">번역 없음 — 영어 원문만 있어요</p>`;
  } else if (!showKo) {
    ko = `<button class="link" data-action="toggle-ko">한국어 번역 보기</button>`;
  } else {
    const lines = twopart
      ? `<p>${esc(translation.setup)}</p>${revealed ? `<p class="delivery">${esc(translation.delivery)}</p>` : ''}`
      : `<p>${esc(translation.joke)}</p>`;
    const note = translation.note && (revealed || !twopart) ? `<p class="note">풀이: ${esc(translation.note)}</p>` : '';
    ko = `<div class="ko">${lines}${note}<button class="link" data-action="toggle-ko">번역 숨기기</button></div>`;
  }

  return `
    <article class="card joke">
      <div class="meta">개그 ${index}/${max} · ${esc(joke.category)} · 영어 원문 <span>(JokeAPI는 한국어가 없어요)</span></div>
      ${en}
      <div class="ko-wrap">${ko}</div>
    </article>`;
}

/**
 * m = { status, total, joke, translation, index, max, revealed, showKo,
 *       canNext, signal, jokeVisible }
 */
export function renderBreak(root, m) {
  const ended = !!m.signal;
  const clock = ended
    ? `<span class="clock done">쉼 끝</span>`
    : `<span class="clock" data-clock>${formatClock(m.status.remainingSec)}</span>`;
  const pct = ended ? 0 : Math.round((m.status.remainingSec / m.total) * 100);

  const signal = m.signal
    ? `<section class="card signal">
         <h2>${esc(m.signal.title)}</h2>
         <p class="task">${esc(m.signal.taskLine)}</p>
         <p class="first">${esc(m.signal.firstStep)}</p>
         <button class="primary" data-action="back">돌아가기</button>
       </section>`
    : '';

  const actions = ended
    ? ''
    : `<div class="actions">
         ${m.canNext ? `<button class="primary" data-action="next">다음 개그 (${m.index + 1}/${m.max})</button>` : ''}
         <button data-action="finish">벌써 돌아갈래요</button>
       </div>`;

  root.innerHTML = `
    <section class="clockrow ${ended ? 'ended' : ''}">
      ${clock}
      <div class="bar"><i data-bar style="width:${pct}%"></i></div>
    </section>
    ${m.jokeVisible ? jokeCard(m) : ''}
    ${actions}
    ${signal}`;
}

/** 1초마다 시간만 갱신 (전체를 다시 그리지 않는다) */
export function updateClock(root, remainingSec, total) {
  const clock = root.querySelector('[data-clock]');
  const bar = root.querySelector('[data-bar]');
  if (clock) clock.textContent = formatClock(remainingSec);
  if (bar) bar.style.width = `${Math.round((remainingSec / total) * 100)}%`;
}

export function renderSource(el, { mode, fetchedAt }) {
  const when = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '';
  const modeText = {
    live: `실시간 (받은 시각 ${when})`,
    fixture: '고정 파일 (?fixture=1)',
    fallback: '고정 파일로 대체 (실시간 연결 실패)',
    pending: '개그를 받아 오는 중…',
  }[mode] ?? '';
  el.innerHTML = `
    <p>개그 출처: <a href="https://jokeapi.dev/" target="_blank" rel="noopener">JokeAPI</a> (v2.jokeapi.dev) · 모드: <b class="mode ${esc(mode)}">${esc(modeText)}</b></p>
    <p>번역: Claude가 직접 쓴 의역이에요(공식 번역 아님). 개그는 safe-mode로 가려 받았지만 취향에 안 맞을 수 있어요.</p>`;
}
