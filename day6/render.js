// 그리기 — 규칙이 준 결과를 화면으로 옮길 뿐, 여기서는 판단하지 않는다.

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const wikiLink = (title) => `https://ko.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

export function renderBreedList(el, breeds, selectedKey) {
  if (!breeds.length) {
    el.innerHTML = `<p class="empty">찾는 품종이 없어요. 다른 이름으로 검색해 보세요.</p>`;
    return;
  }
  el.innerHTML = breeds
    .map((b) => `<button type="button" class="chip${b.key === selectedKey ? ' on' : ''}" data-key="${esc(b.key)}">${esc(b.ko)}</button>`)
    .join('');
}

// 설명 카드. desc = rules.describeSummary 결과
function descriptionCard(breed, desc) {
  const more = `<a href="${wikiLink(breed.wiki)}" target="_blank" rel="noopener">위키백과에서 더 보기</a>`;
  if (desc.kind === 'loading') return `<div class="desc"><p class="loading">설명 불러오는 중…</p></div>`;
  if (desc.kind === 'ok') return `<div class="desc"><p>${esc(desc.text)}</p><p class="more">${more}</p></div>`;
  if (desc.kind === 'short') {
    return `<div class="desc"><p>${esc(desc.text)}</p><p class="warn">위키 요약이 짧아요.</p><p class="more">${more}</p></div>`;
  }
  if (desc.kind === 'wrong') {
    return `<div class="desc"><p class="warn">이 품종의 위키 설명을 확인할 수 없어요. 다른 문서로 연결됐을 수 있어서 보여 주지 않아요.</p><p class="more">${more}</p></div>`;
  }
  return `<div class="desc"><p class="warn">설명을 가져오지 못했어요.</p><p class="more">${more}</p></div>`;
}

const photo = (url, ko) =>
  `<img src="${esc(url)}" alt="${esc(ko)} 사진" referrerpolicy="no-referrer">`;

/** 도감 상세. state: loading | ready */
export function renderDetail(el, { breed, state, urls, desc }) {
  if (!breed) {
    el.innerHTML = `<div class="card hint">품종을 고르면 사진과 한국어 설명이 나와요.</div>`;
    return;
  }
  if (state === 'loading') {
    el.innerHTML = `<div class="card"><h2>${esc(breed.ko)}</h2><p class="loading">불러오는 중…</p></div>`;
    return;
  }
  el.innerHTML = `
    <article class="card">
      <h2>${esc(breed.ko)}</h2>
      <div class="photos">${(urls || []).map((u) => photo(u, breed.ko)).join('') || '<p class="warn">사진을 가져오지 못했어요.</p>'}</div>
      ${descriptionCard(breed, desc)}
    </article>`;
}

export function renderScore(el, score) {
  el.innerHTML = `맞힌 개수 <b>${score.correct}/${score.total}</b> · 연속 정답 <b>${score.streak}</b> · 최고 연속 <b>${score.best}</b>`;
}

/**
 * 퀴즈. state: loading | asking | answered
 * q = { options:[{key, ko}], answerKey }, image = url|null, chosenKey, desc, breedOfAnswer
 */
export function renderQuiz(el, { state, q, image, chosenKey, desc, answer }) {
  if (state === 'loading' || !q) {
    el.innerHTML = `<div class="card"><p class="loading">문제 고르는 중…</p></div>`;
    return;
  }
  const answered = state === 'answered';
  const options = q.options
    .map((o) => {
      let cls = 'opt';
      if (answered && o.key === q.answerKey) cls += ' right';
      else if (answered && o.key === chosenKey) cls += ' wrong';
      return `<button type="button" class="${cls}" data-choice="${esc(o.key)}" ${answered ? 'disabled' : ''}>${esc(o.ko)}</button>`;
    })
    .join('');
  const result = answered
    ? `<div class="result ${chosenKey === q.answerKey ? 'good' : 'bad'}">${chosenKey === q.answerKey ? '정답! 🎉' : `아쉬워요. 정답은 <b>${esc(answer.ko)}</b>`}</div>
       ${descriptionCard(answer, desc)}
       <button type="button" class="primary" data-action="next">다음 문제</button>`
    : '';
  el.innerHTML = `
    <article class="card quiz">
      <p class="q">이 강아지는 어떤 품종일까요?</p>
      <div class="bigphoto">${image ? photo(image, '퀴즈') : '<p class="warn">사진을 가져오지 못했어요.</p>'}</div>
      <div class="options">${options}</div>
      ${result}
    </article>`;
}

/** AI 카드. 품종을 고르면 설명 아래에 나온다. ai = app 쪽 상태(아래 필드) */
export function renderAi(el, ai) {
  if (!ai.breed) { el.innerHTML = ''; return; }
  if (!ai.serverAi) {
    el.innerHTML = `<article class="card ai"><h3>🐾 AI에게 물어보기</h3><p class="hint">이 서버에서는 AI를 쓸 수 없어요. (server.py 로 열어야 해요)</p></article>`;
    return;
  }
  if (!ai.enabled) {
    el.innerHTML = `<article class="card ai"><h3>🐾 AI에게 물어보기</h3><p class="hint">근거가 되는 위키 설명이 없어서 AI에게 물어볼 수 없어요.</p></article>`;
    return;
  }
  const busy = ai.ask.status === 'loading' || ai.simp.status === 'loading';

  const chips = ai.chips
    .map((q) => `<button type="button" class="chip" data-ask="${esc(q)}" ${busy ? 'disabled' : ''}>${esc(q)}</button>`)
    .join('');

  let askResult = '';
  if (ai.ask.status === 'loading') {
    askResult = `<p class="loading">AI가 위키 설명을 읽는 중… (보통 5~15초)</p>`;
  } else if (ai.ask.status === 'error') {
    askResult = `<p class="warn">${esc(ai.ask.message)}</p>`;
  } else if (ai.ask.status === 'done') {
    const badge = ai.ask.noEvidence ? `<span class="badge none">위키에 없는 내용이에요</span>` : `<span class="badge">AI 답변 · 위키 설명만 근거</span>`;
    askResult = `<div class="answer"><p class="qline">Q. ${esc(ai.ask.question)}</p><p>${esc(ai.ask.answer)}</p>${badge}</div>`;
  }

  let simpResult = '';
  if (ai.simp.status === 'loading') {
    simpResult = `<p class="loading">AI가 쉬운 말로 바꾸는 중…</p>`;
  } else if (ai.simp.status === 'error') {
    simpResult = `<p class="warn">${esc(ai.simp.message)}</p>`;
  } else if (ai.simp.status === 'done') {
    simpResult = `<div class="answer easy"><p>${esc(ai.simp.text)}</p><span class="badge">AI가 쉽게 풀어쓴 글 · 원문은 위의 위키 설명</span></div>`;
  }

  el.innerHTML = `
    <article class="card ai">
      <h3>🐾 AI에게 물어보기 <small>${esc(ai.breed.ko)}</small></h3>
      <p class="hint">위키 설명만 보고 대답해요. 틀릴 수 있어요.${ai.fixture ? ' <b>(고정 파일 모드: 푸들·시바견의 추천 질문만 돼요)</b>' : ''}</p>
      <div class="chips">${chips}</div>
      <form id="ask-form" class="askform">
        <input id="ask-input" type="text" maxlength="80" placeholder="궁금한 걸 물어보세요" value="${esc(ai.draft)}" ${busy ? 'disabled' : ''} autocomplete="off">
        <button type="submit" class="primary" ${busy ? 'disabled' : ''}>물어보기</button>
      </form>
      ${askResult}
      <div class="easywrap">
        <button type="button" data-action="simplify" ${busy ? 'disabled' : ''}>🔤 쉬운 말로 풀어쓰기</button>
        ${simpResult}
      </div>
    </article>`;
}

/**
 * 챗봇 화면. chat = { messages, choices, busy, draft, fixture, serverAi }
 * message = { role:'me'|'bot'|'typing'|'error', text, sources?, noEvidence?, offtopic? }
 */
export function renderChat(el, chat) {
  if (!chat.serverAi) {
    el.innerHTML = `<article class="card"><p class="hint">이 서버에서는 AI를 쓸 수 없어요. (server.py 로 열어야 해요)</p></article>`;
    return;
  }
  const bubble = (m) => {
    if (m.role === 'me') return `<div class="msg me">${esc(m.text)}</div>`;
    if (m.role === 'typing') return `<div class="msg bot typing">AI가 도감을 찾아보는 중… (보통 5~15초)</div>`;
    if (m.role === 'error') return `<div class="msg bot err">${esc(m.text)}</div>`;
    const sources = (m.sources || []).length
      ? `<div class="srcs"><span>근거로 쓴 품종</span>${m.sources
          .map((s) => `<button type="button" class="src" data-open-breed="${esc(s.key)}">${esc(s.ko)}</button>`)
          .join('')}</div>`
      : '';
    let badge = '';
    if (m.noEvidence) badge = `<span class="badge none">위키에 없는 내용이에요</span>`;
    else if (m.sources && m.sources.length) badge = `<span class="badge">AI 답변 · 위키 설명만 근거 · 틀릴 수 있어요</span>`;
    return `<div class="msg bot"><p>${esc(m.text)}</p>${badge}${sources}</div>`;
  };
  const choices = chat.choices
    .map((q) => `<button type="button" class="chip" data-choice-q="${esc(q)}" ${chat.busy ? 'disabled' : ''}>${esc(q)}</button>`)
    .join('');
  el.innerHTML = `
    <article class="card chatcard">
      <div class="chatlog">${chat.messages.map(bubble).join('')}</div>
      ${chat.fixture ? '<p class="hint">고정 파일 모드: 아래 선택지 5개만 대답해요.</p>' : ''}
      ${choices ? `<div class="chips choices">${choices}</div>` : ''}
      <form id="chat-form" class="askform">
        <input id="chat-input" type="text" maxlength="80" placeholder="도감에 물어보세요 (예: 털 안 빠지는 작은 개)" value="${esc(chat.draft)}" ${chat.busy ? 'disabled' : ''} autocomplete="off">
        <button type="submit" class="primary" ${chat.busy ? 'disabled' : ''}>보내기</button>
      </form>
      <button type="button" class="link" data-action="chat-clear">대화 지우기</button>
    </article>`;
  const log = el.querySelector('.chatlog');
  if (log) log.scrollTop = log.scrollHeight;
}

/** 출처 + 모드. modes = { image, wiki, ai } 각각 live|cache|fixture|fallback|null. status = /api/status 결과 */
export function renderSource(el, modes, status = {}) {
  const label = {
    live: '실시간',
    cache: '실시간(저장된 답)',
    fixture: '고정 파일 (?fixture=1)',
    fallback: '고정 파일로 대체 (실시간 연결 실패)',
  };
  const show = (m) => (m ? `<b class="mode ${esc(m)}">${esc(label[m])}</b>` : '<span class="mode">아직 안 불렀어요</span>');
  const models = status.models
    ? `질문 ${esc(status.models.ask.split('/').pop())} · 쉬운 말 ${esc(status.models.simplify.split('/').pop())}`
    : 'AI 서버 없음';
  el.innerHTML = `
    <p>사진: <a href="https://dog.ceo/dog-api/" target="_blank" rel="noopener">Dog CEO</a> (dog.ceo) · ${show(modes.image)}</p>
    <p>설명: <a href="https://ko.wikipedia.org/" target="_blank" rel="noopener">한국어 위키백과</a> (CC BY-SA, 각 문서 링크에서 저자 확인) · ${show(modes.wiki)}</p>
    <p>AI: <a href="https://build.nvidia.com/" target="_blank" rel="noopener">NVIDIA</a> (build.nvidia.com) · ${models} · ${show(modes.ai)}</p>
    <p>품종 이름표는 직접 하나씩 검증해서 만들었어요. 사진은 원격이라 인터넷이 필요해요. AI는 틀릴 수 있어요.</p>`;
}
