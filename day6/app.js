// 이벤트 연결 · 상태 · 저장. 판단은 rules.js, 그리기는 render.js, 호출은 api.js.
import { BREEDS } from './data/breeds.js';
import {
  describeSummary, searchBreeds, seededRng, makeQuestion, judgeAnswer, updateScore, EMPTY_SCORE,
  canUseAi, validateQuestion, isNoEvidence, cooldownLeft, SUGGESTED_QUESTIONS, CHAT_CHOICES, nextChoices,
} from './rules.js';
import { fetchImages, fetchSummary, askAi, simplifyText, chatAsk, loadAiStatus } from './api.js';
import { renderBreedList, renderDetail, renderScore, renderQuiz, renderSource, renderAi, renderChat } from './render.js';

const params = new URLSearchParams(location.search);
const FIXTURE = params.get('fixture') === '1';
const SEED = Number(params.get('seed')) || 1;

const $ = (id) => document.getElementById(id);
const el = {
  search: $('search'), list: $('list'), detail: $('detail'), ai: $('ai'),
  chat: $('chat'), chatPanel: $('chat-panel'),
  dex: $('dex'), quiz: $('quiz-panel'), quizBody: $('quiz-body'), score: $('score'), source: $('source'),
};
const byKey = Object.fromEntries(BREEDS.map((b) => [b.key, b]));

const store = {
  get(k, fallback) { try { const v = localStorage.getItem(`day6:${k}`); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(`day6:${k}`, JSON.stringify(v)); } catch { /* 저장 실패는 무시 */ } },
};

const app = {
  tab: 'dex',
  selectedKey: null,
  detailToken: 0,
  rng: seededRng(SEED),
  lastKey: null,
  question: null,
  quizState: 'loading',
  quizImage: null,
  chosenKey: null,
  quizDesc: null,
  score: store.get('score', EMPTY_SCORE),
  modes: { image: null, wiki: null, ai: null },
  quizStarted: false,
  serverStatus: { ai: false, models: null },
  chat: null, // 아래 resetChat()
  ai: { breedKey: null, enabled: false, draft: '', ask: { status: 'idle' }, simp: { status: 'idle' }, lastAt: null },
};

function drawSource() {
  renderSource(el.source, app.modes, app.serverStatus);
}
function noteMode(kind, mode) {
  app.modes[kind] = mode;
  drawSource();
}

/* ---------- 도감 ---------- */
function drawList() {
  renderBreedList(el.list, searchBreeds(BREEDS, el.search.value), app.selectedKey);
}

function drawAi() {
  const breed = byKey[app.ai.breedKey] ?? null;
  renderAi(el.ai, {
    breed, serverAi: app.serverStatus.ai, enabled: app.ai.enabled, chips: SUGGESTED_QUESTIONS,
    draft: app.ai.draft, ask: app.ai.ask, simp: app.ai.simp, fixture: FIXTURE,
  });
}

function resetAi(breedKey, enabled) {
  app.ai = { breedKey, enabled, draft: '', ask: { status: 'idle' }, simp: { status: 'idle' }, lastAt: null };
  drawAi();
}

async function selectBreed(key) {
  const breed = byKey[key];
  app.selectedKey = key;
  const token = ++app.detailToken;
  drawList();
  renderDetail(el.detail, { breed, state: 'loading' });
  resetAi(null, false); // 새 설명이 올 때까지 AI 카드는 숨긴다
  // 사진 3장과 설명은 동시에 받는다. 위키는 이 품종 하나만 부른다.
  const [img, sum] = await Promise.all([
    fetchImages(key, 3, { fixture: FIXTURE }),
    fetchSummary(breed.wiki, { fixture: FIXTURE }),
  ]);
  if (token !== app.detailToken) return; // 그새 다른 품종을 골랐으면 버린다
  noteMode('image', img.mode);
  noteMode('wiki', sum.mode);
  const desc = describeSummary(sum.summary);
  renderDetail(el.detail, { breed, state: 'ready', urls: img.urls, desc });
  resetAi(key, canUseAi(desc)); // 근거가 되는 위키 설명이 있을 때만 AI를 쓴다
}

/* ---------- AI(NVIDIA) ---------- */
async function ask(text) {
  const key = app.ai.breedKey;
  if (!key) return;
  const v = validateQuestion(text);
  if (!v.ok) { app.ai.ask = { status: 'error', message: v.reason }; return drawAi(); }
  if (cooldownLeft(app.ai.lastAt, Date.now()) > 0) {
    app.ai.ask = { status: 'error', message: '조금만 천천히 물어봐 주세요.' };
    return drawAi();
  }
  app.ai.lastAt = Date.now();
  app.ai.draft = v.text;
  app.ai.ask = { status: 'loading' };
  drawAi();
  const res = await askAi(key, v.text, { fixture: FIXTURE });
  if (app.ai.breedKey !== key) return; // 그새 다른 품종을 골랐다
  if (res.ok) {
    app.ai.ask = { status: 'done', question: v.text, answer: res.answer, noEvidence: isNoEvidence(res.answer) };
    noteMode('ai', res.mode);
  } else {
    app.ai.ask = { status: 'error', message: res.message };
  }
  drawAi();
}

async function simplify() {
  const key = app.ai.breedKey;
  if (!key) return;
  app.ai.simp = { status: 'loading' };
  drawAi();
  const res = await simplifyText(key, { fixture: FIXTURE });
  if (app.ai.breedKey !== key) return;
  if (res.ok) {
    app.ai.simp = { status: 'done', text: res.answer };
    noteMode('ai', res.mode);
  } else {
    app.ai.simp = { status: 'error', message: res.message };
  }
  drawAi();
}

/* ---------- 퀴즈 ---------- */
function drawQuiz() {
  const q = app.question
    ? { answerKey: app.question.answerKey, options: app.question.optionKeys.map((k) => ({ key: k, ko: byKey[k].ko })) }
    : null;
  renderQuiz(el.quizBody, {
    state: app.quizState, q, image: app.quizImage, chosenKey: app.chosenKey, desc: app.quizDesc,
    answer: q ? byKey[q.answerKey] : null,
  });
  renderScore(el.score, app.score);
}

async function nextQuestion() {
  app.quizState = 'loading';
  app.chosenKey = null;
  app.quizDesc = null;
  drawQuiz();
  const question = makeQuestion(BREEDS, app.rng, 4, app.lastKey);
  app.lastKey = question.answerKey;
  const img = await fetchImages(question.answerKey, 1, { fixture: FIXTURE });
  noteMode('image', img.mode);
  app.question = question;
  app.quizImage = img.urls[0] ?? null;
  app.quizState = 'asking';
  drawQuiz();
}

async function answer(chosenKey) {
  if (app.quizState !== 'asking') return;
  const result = judgeAnswer(app.question, chosenKey);
  app.score = updateScore(app.score, result.correct);
  store.set('score', app.score);
  app.chosenKey = chosenKey;
  app.quizState = 'answered';
  app.quizDesc = { kind: 'loading', text: '' };
  drawQuiz();
  const sum = await fetchSummary(byKey[app.question.answerKey].wiki, { fixture: FIXTURE });
  noteMode('wiki', sum.mode);
  if (app.quizState === 'answered' && app.chosenKey === chosenKey) {
    app.quizDesc = describeSummary(sum.summary);
    drawQuiz();
  }
}


/* ---------- 챗봇 (품종을 고르지 않고 말로 묻는다) ---------- */
const GREETING = {
  role: 'bot',
  text: '안녕하세요! 저는 도감 챗봇이에요. 털, 크기, 성격, 유래처럼 궁금한 걸 물어보세요. 아래 선택지를 눌러도 돼요.',
};

function resetChat() {
  app.chat = { messages: [GREETING], asked: [], busy: false, lastAt: null, draft: '' };
}

function drawChat() {
  const c = app.chat;
  renderChat(el.chat, {
    messages: c.messages, busy: c.busy, draft: c.draft, fixture: FIXTURE, serverAi: app.serverStatus.ai,
    choices: nextChoices(c.asked, c.asked.length ? 3 : CHAT_CHOICES.length),
  });
}

async function sendChat(text) {
  const c = app.chat;
  if (c.busy) return;
  const v = validateQuestion(text);
  if (!v.ok) {
    c.messages.push({ role: 'error', text: v.reason });
    return drawChat();
  }
  if (cooldownLeft(c.lastAt, Date.now()) > 0) {
    c.messages.push({ role: 'error', text: '조금만 천천히 물어봐 주세요.' });
    return drawChat();
  }
  c.lastAt = Date.now();
  c.draft = '';
  c.asked.push(v.text);
  c.busy = true;
  c.messages.push({ role: 'me', text: v.text }, { role: 'typing' });
  drawChat();
  const res = await chatAsk(v.text, { fixture: FIXTURE });
  c.messages = c.messages.filter((m) => m.role !== 'typing');
  c.busy = false;
  if (res.ok) {
    c.messages.push({ role: 'bot', text: res.answer, sources: res.sources, noEvidence: isNoEvidence(res.answer), offtopic: !!res.offtopic });
    noteMode('ai', res.mode);
  } else {
    c.messages.push({ role: 'error', text: res.message });
  }
  drawChat();
}

function openBreed(key) {
  el.search.value = '';
  showTab('dex');
  selectBreed(key);
  el.detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- 탭 ---------- */
function showTab(tab) {
  app.tab = tab;
  el.dex.hidden = tab !== 'dex';
  el.quiz.hidden = tab !== 'quiz';
  el.chatPanel.hidden = tab !== 'chat';
  document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  if (tab === 'quiz' && !app.quizStarted) {
    app.quizStarted = true;
    nextQuestion();
  }
}

/* ---------- 이벤트 ---------- */
document.querySelector('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) showTab(b.dataset.tab);
});
el.search.addEventListener('input', drawList);
el.list.addEventListener('click', (e) => {
  const b = e.target.closest('[data-key]');
  if (b) selectBreed(b.dataset.key);
});
el.quizBody.addEventListener('click', (e) => {
  const choice = e.target.closest('[data-choice]');
  if (choice) return answer(choice.dataset.choice);
  if (e.target.closest('[data-action="next"]')) nextQuestion();
});
el.ai.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-ask]');
  if (chip) return ask(chip.dataset.ask);
  if (e.target.closest('[data-action="simplify"]')) simplify();
});
el.ai.addEventListener('input', (e) => {
  if (e.target.id === 'ask-input') app.ai.draft = e.target.value; // 다시 그려도 입력이 사라지지 않게
});
el.ai.addEventListener('submit', (e) => {
  e.preventDefault();
  ask(app.ai.draft);
});
el.chat.addEventListener('click', (e) => {
  const choice = e.target.closest('[data-choice-q]');
  if (choice) return sendChat(choice.dataset.choiceQ);
  const src = e.target.closest('[data-open-breed]');
  if (src) return openBreed(src.dataset.openBreed);
  if (e.target.closest('[data-action="chat-clear"]')) {
    resetChat();
    drawChat();
  }
});
el.chat.addEventListener('input', (e) => {
  if (e.target.id === 'chat-input') app.chat.draft = e.target.value;
});
el.chat.addEventListener('submit', (e) => {
  e.preventDefault();
  sendChat(app.chat.draft);
});
// 사진이 안 열리면 안내로 바꾼다
document.addEventListener('error', (e) => {
  if (e.target.tagName === 'IMG') {
    const note = document.createElement('p');
    note.className = 'warn';
    note.textContent = '사진을 불러오지 못했어요.';
    e.target.replaceWith(note);
  }
}, true);

resetChat();
drawList();
renderDetail(el.detail, { breed: null });
renderScore(el.score, app.score);
drawSource();
loadAiStatus().then((status) => {
  app.serverStatus = status;
  drawSource();
  drawAi();
  drawChat();
});
