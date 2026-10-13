// 판단 규칙 — 화면·네트워크와 분리된 순수 함수.
// 이 파일은 fetch, Date.now(), DOM을 쓰지 않는다. (무작위는 rng를 인자로 받는다)

// 위키 요약이 이만큼보다 짧으면 "요약이 짧아요"로 알린다.
export const MIN_SUMMARY_CHARS = 60;

// 한국어 위키가 개 품종 문서를 쓸 때 나오는 표현들 (tools/build_fixtures.py 의 DOG 와 같은 기준)
// "개이다/개로/개 일종", "중형견으로/애완견의/송사견", "견종/품종/犬", 하운드·테리어 같은 품종 낱말.
export const DOG_PATTERN = new RegExp(
  '(^|[^가-힣])개(이다|로|를|의|와|가|는|입니다|(?![가-힣]))' +
    '|[가-힣]견(으로|이다|은|는|을|를|의|이|인|도|로|(?![가-힣]))|견종|품종|犬' +
    '|하운드|테리어|스패니얼|마스티프|리트리버|쉽독|핀셔|슈나우저|콜리|세터|포인터|dog',
  'i'
);

/**
 * 위키 요약 응답을 화면에 써도 되는지 판단한다.
 *  ok      : 그대로 보여 줘도 됨
 *  short   : 개 문서가 맞지만 요약이 짧음
 *  wrong   : 동음이의 문서이거나 개와 상관없는 문서 (예: "샤페이" → 사람 문서)
 *  missing : 응답이 없음
 */
export function describeSummary(summary) {
  const text = String(summary?.extract ?? '').trim();
  if (!summary || !text) return { kind: 'missing', text: '' };
  if (summary.type !== 'standard') return { kind: 'wrong', text: '' };
  if (!DOG_PATTERN.test(text.slice(0, 150))) return { kind: 'wrong', text: '' };
  if (text.length < MIN_SUMMARY_CHARS) return { kind: 'short', text };
  return { kind: 'ok', text };
}

const squash = (s) => String(s).toLowerCase().replace(/\s+/g, '');

/** 검색: 공백·대소문자 무시, 한국어 이름 또는 영어 키에 포함되면 일치. 한국어 이름순. */
export function searchBreeds(catalog, query) {
  const q = squash(query);
  const hits = q
    ? catalog.filter((b) => squash(b.ko).includes(q) || squash(b.key.replace('/', '')).includes(q))
    : catalog;
  return [...hits].sort((a, b) => a.ko.localeCompare(b.ko, 'ko'));
}

/** seed가 같으면 항상 같은 수열을 주는 난수 (mulberry32). 0 이상 1 미만. */
export function seededRng(seed = 1) {
  let a = (Number(seed) || 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, rng) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * 퀴즈 한 문제. 보기들은 한국어 이름도, 위키 문서도 서로 겹치지 않는다.
 * (카디건·펨브로크는 같은 "웰시 코기" 문서라 한 문제에 같이 나오지 않는다.)
 * lastKey: 직전 정답이 또 나오지 않게 한다.
 */
export function makeQuestion(catalog, rng, optionCount = 4, lastKey = null) {
  const pool = catalog.filter((b) => b.key !== lastKey);
  const answer = pool[Math.floor(rng() * pool.length)];
  const usedKo = new Set([answer.ko]);
  const usedWiki = new Set([answer.wiki]);
  const options = [answer];
  for (const cand of shuffled(catalog, rng)) {
    if (options.length >= optionCount) break;
    if (usedKo.has(cand.ko) || usedWiki.has(cand.wiki)) continue;
    usedKo.add(cand.ko);
    usedWiki.add(cand.wiki);
    options.push(cand);
  }
  return { answerKey: answer.key, optionKeys: shuffled(options, rng).map((b) => b.key) };
}

export function judgeAnswer(question, chosenKey) {
  return { correct: chosenKey === question.answerKey, answerKey: question.answerKey };
}

export const EMPTY_SCORE = { total: 0, correct: 0, streak: 0, best: 0 };

export function updateScore(score = EMPTY_SCORE, correct) {
  const streak = correct ? score.streak + 1 : 0;
  return {
    total: score.total + 1,
    correct: score.correct + (correct ? 1 : 0),
    streak,
    best: Math.max(score.best, streak),
  };
}

/* ---------- AI(NVIDIA) 관련 규칙 ---------- */

export const QUESTION_MIN = 2;
export const QUESTION_MAX = 80;
export const SUGGESTED_QUESTIONS = [
  '털이 많이 빠져요?',
  '성격이 어때요?',
  '어디서 온 품종이에요?',
  '크기가 어떻게 돼요?',
  '아파트에서 키워도 돼요?',
];

/** AI는 "근거가 되는 위키 설명"이 있을 때만 쓴다. wrong/missing이면 근거가 없으니 쓰지 않는다. */
export function canUseAi(desc) {
  return (desc?.kind === 'ok' || desc?.kind === 'short') && String(desc.text ?? '').length > 0;
}

/** 질문 다듬기·검사. 반환: { ok:true, text } | { ok:false, reason } */
export function validateQuestion(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length < QUESTION_MIN) return { ok: false, reason: `질문을 ${QUESTION_MIN}글자 이상 써 주세요.` };
  if (t.length > QUESTION_MAX) return { ok: false, reason: `질문은 ${QUESTION_MAX}글자까지 쓸 수 있어요.` };
  return { ok: true, text: t };
}

/** AI가 "위키에 없어요"라고 답했나 (화면에서 배지로 구분) */
export function isNoEvidence(answer) {
  return /나와 있지 않/.test(String(answer ?? ''));
}

/** 연타 방지: 아직 기다려야 하는 밀리초 (0이면 괜찮음) */
export function cooldownLeft(lastAtMs, nowMs, gapMs = 2000) {
  return lastAtMs == null ? 0 : Math.max(0, gapMs - (nowMs - lastAtMs));
}

/* ---------- 챗봇(도감 전체에 말로 묻기) 규칙 ---------- */

// 시작 선택지. tools/build_nvidia_samples.py 의 CHAT_CHOICES 와 같아야 한다 (고정 파일 모드 샘플).
export const CHAT_CHOICES = [
  '털 적게 빠지는 개 추천해줘',
  '썰매 끄는 큰 개는 뭐야?',
  '푸들이랑 시바견 중에 어떤 게 털 관리가 쉬워?',
  '초보자한테 좋은 순한 개 알려줘',
  '일본에서 온 개는?',
];

/** 이미 물어본 질문(asked)을 뺀 선택지 n개 */
export function nextChoices(asked, n = 3, all = CHAT_CHOICES) {
  return all.filter((q) => !asked.includes(q)).slice(0, n);
}
