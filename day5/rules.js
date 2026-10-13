// 쉬는 시간 규칙 — 화면·네트워크와 분리된 순수 함수.
// 시간은 모두 인자(nowMs)로 받는다. 이 파일은 Date.now()를 부르지 않는다.

// 조정하기 쉽게 맨 위에 모아 둔다.
export const LIMITS = { breakSeconds: 180, maxJokes: 3 };

/** 쉼 시작. task는 쉬기 전에 적은 "지금 하던 일 한 줄". */
export function startBreak(nowMs, task = '') {
  return {
    startedAt: nowMs,
    task: String(task).trim(),
    jokesShown: 0,
    countReachedAt: null, // 개그를 maxJokes개 다 본 순간
    endedEarlyAt: null, // 내가 먼저 끝낸 순간
  };
}

// 가장 먼저 일어난 "끝" 사건 (스스로 끝냄 / 개그 다 봄 / 시간 끝)
function firstEnd(state, nowMs, limits) {
  const events = [];
  if (state.endedEarlyAt != null) events.push({ at: state.endedEarlyAt, phase: 'endedEarly' });
  if (state.countReachedAt != null) events.push({ at: state.countReachedAt, phase: 'endedByCount' });
  events.push({ at: state.startedAt + limits.breakSeconds * 1000, phase: 'endedByTime' });
  const happened = events.filter((e) => e.at <= nowMs).sort((a, b) => a.at - b.at);
  return happened[0] ?? null;
}

/**
 * 지금 상태.
 * phase: resting(쉬는 중) | endedByTime | endedByCount | endedEarly
 */
export function breakStatus(state, nowMs, limits = LIMITS) {
  const end = firstEnd(state, nowMs, limits);
  const elapsedSec = Math.max(0, Math.floor((nowMs - state.startedAt) / 1000));
  const remainingMs = state.startedAt + limits.breakSeconds * 1000 - nowMs;
  const remainingSec = Math.min(limits.breakSeconds, Math.max(0, Math.ceil(remainingMs / 1000)));
  return {
    phase: end ? end.phase : 'resting',
    endedAt: end ? end.at : null,
    elapsedSec,
    remainingSec,
  };
}

/** "다음 개그"를 줄 수 있나. 쉬는 중이고 아직 maxJokes개 미만일 때만. 이게 무한 스크롤을 막는다. */
export function canShowNext(state, nowMs, limits = LIMITS) {
  return breakStatus(state, nowMs, limits).phase === 'resting' && state.jokesShown < limits.maxJokes;
}

/** 개그 하나를 보여 줌. 줄 수 없으면 상태를 그대로 돌려준다. */
export function showJoke(state, nowMs, limits = LIMITS) {
  if (!canShowNext(state, nowMs, limits)) return state;
  const jokesShown = state.jokesShown + 1;
  return {
    ...state,
    jokesShown,
    countReachedAt: jokesShown >= limits.maxJokes ? nowMs : state.countReachedAt,
  };
}

/** "벌써 돌아갈래요". 이미 끝난 쉼이면 그대로. */
export function endEarly(state, nowMs, limits = LIMITS) {
  if (breakStatus(state, nowMs, limits).phase !== 'resting') return state;
  return { ...state, endedEarlyAt: nowMs };
}

/** 쉼이 끝났을 때 보여 줄 "돌아갈 신호". 쉬는 중이면 null. */
export function returnSignal(state, nowMs, limits = LIMITS) {
  const { phase } = breakStatus(state, nowMs, limits);
  if (phase === 'resting') return null;
  const titles = {
    endedByTime: `${durationLabel(limits.breakSeconds)} 다 됐어요. 쉼 끝!`,
    endedByCount: `개그 ${limits.maxJokes}개를 다 봤어요. 쉼 끝!`,
    endedEarly: '스스로 쉼을 끝냈어요. 잘했어요!',
  };
  return {
    phase,
    title: titles[phase],
    taskLine: state.task ? `아까 하던 일: ${state.task}` : '아까 하던 일로 돌아가요',
    firstStep: state.task ? '첫 5분만 해 보자.' : '일단 첫 5분만 해 보자.',
  };
}

/** 이번 쉼 요약 (실제로 쉰 초, 본 개그 수). 이력 저장용. */
export function summarizeBreak(state, nowMs, limits = LIMITS) {
  const s = breakStatus(state, nowMs, limits);
  const endMs = s.endedAt ?? nowMs;
  const seconds = Math.min(limits.breakSeconds, Math.max(0, Math.round((endMs - state.startedAt) / 1000)));
  return { phase: s.phase, seconds, jokes: state.jokesShown };
}

/** 오늘 쉰 기록에 이번 쉼을 더한다. 날짜가 바뀌면 새로 시작. */
export function recordBreak(history, summary, dateStr) {
  const base = history && history.date === dateStr ? history : { date: dateStr, count: 0, totalSec: 0 };
  return { date: dateStr, count: base.count + 1, totalSec: base.totalSec + summary.seconds };
}

/** 180 -> "3분", 90 -> "90초" (시험용으로 짧게 줄여도 문구가 어색하지 않게) */
export function durationLabel(sec) {
  return sec >= 60 && sec % 60 === 0 ? `${sec / 60}분` : `${sec}초`;
}

/** 125 -> "2:05" */
export function formatClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
