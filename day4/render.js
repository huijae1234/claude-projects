// render.js — 그리기. rules.js가 돌려준 결과(숫자·색 이름·문구)를 화면에 옮기기만 하고, 판단하지 않는다.
(function (root) {
  'use strict';

  const R = () => root.Rules;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    kids.forEach((c) => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c)); });
    return el;
  }

  const TONE_LABEL = { red: '급함', orange: '임박', green: '여유', gray: '확인', done: '완료' };

  function deadlineText(entry) {
    const Rl = R();
    if (entry.type === 'closing') return '채용 시 마감';
    if (entry.type === 'always') return '상시';
    if (!Rl.isValidYmd(entry.date)) return '날짜 없음';
    const origin = entry.origin ? ' · 입력: ' + entry.origin : '';
    return Rl.fmtMdW(entry.date) + ' ' + (entry.time || '23:59') + ' 마감' + origin;
  }

  // 카드 한 장. handlers: { onStatus(id, value), onEdit(id), onDelete(id) }
  function card(item, now, holidays, handlers) {
    const Rl = R();
    const { entry, result } = item;
    const submit = entry.submitDate
      ? '내 제출 목표일 ' + Rl.fmtMdW(entry.submitDate)
      : (entry.type === 'datetime' || entry.type === 'dminus') && Rl.isValidYmd(entry.date) && result.tone !== 'done'
        ? (() => { const s = Rl.suggestSubmitDate(entry.date, holidays); return s ? '제출 목표일 제안 ' + Rl.fmtMdW(s) + ' (마감 바로 앞 영업일)' : ''; })()
        : '';

    const status = h('select', { 'aria-label': entry.company + ' 상태', onchange: (e) => handlers.onStatus(entry.id, e.target.value) },
      ...Rl.STATUSES.map((s) => h('option', { value: s, selected: s === entry.status ? true : null }, s)));

    return h('li', { class: 'card tone-' + result.tone + (result.tone === 'done' ? ' is-done' : '') },
      h('div', { class: 'signal', 'aria-hidden': 'true' }, h('span', { class: 'dot' }), h('span', { text: TONE_LABEL[result.tone] })),
      h('div', { class: 'main' },
        h('div', { class: 'title' },
          h('strong', { text: entry.company }),
          entry.example ? h('span', { class: 'tag', text: '예시' }) : null,
          h('span', { class: 'site', text: entry.site })
        ),
        h('div', { class: 'headline', text: result.headline }),
        result.detail ? h('div', { class: 'detail', text: result.detail }) : null,
        h('div', { class: 'meta', text: deadlineText(entry) }),
        submit ? h('div', { class: 'meta', text: submit }) : null
      ),
      h('div', { class: 'side' },
        status,
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'link', onclick: () => handlers.onEdit(entry.id), text: '수정' }),
          h('button', { type: 'button', class: 'link danger', onclick: () => handlers.onDelete(entry.id), text: '삭제' })
        )
      )
    );
  }

  function list(container, sorted, now, holidays, handlers) {
    container.textContent = '';
    if (!sorted.length) {
      container.append(h('li', { class: 'empty' },
        h('p', { text: '아직 입력한 공고가 없습니다.' }),
        h('p', { class: 'hint', text: '위 칸에 공고를 한 번 입력하면 표기를 통일하고 임박순으로 정렬합니다. 예시 5건으로 먼저 구경할 수도 있습니다.' })));
      return;
    }
    sorted.forEach((item) => container.append(card(item, now, holidays, handlers)));
  }

  function summary(container, sorted) {
    const open = sorted.filter((s) => s.result.group === 0);
    const urgent = open.filter((s) => s.result.tone === 'red').length;
    const soon = open.filter((s) => s.result.tone === 'orange').length;
    container.textContent = '';
    if (!sorted.length) return;
    container.append(
      h('span', { class: 'chip tone-red' }, '오늘·내일 ', h('b', { text: String(urgent) })),
      h('span', { class: 'chip tone-orange' }, '3영업일 이내 ', h('b', { text: String(soon) })),
      h('span', { class: 'chip' }, '마감 진행 중 ', h('b', { text: String(open.length) }))
    );
  }

  function footer(container, now, loaded) {
    const labels = { live: '실시간', cache: '실시간(오늘 받은 값)', fixture: '고정 파일', none: '없음' };
    const parts = loaded.sources.map((s) => s.year + '년 ' + labels[s.source]);
    const at = loaded.sources.length ? new Date(Math.max(...loaded.sources.map((s) => s.at))) : null;
    const atText = at ? at.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : '-';
    container.textContent = '';
    const rows = [
      h('p', null, '공휴일 데이터: ', h('a', { href: 'https://date.nager.at/', target: '_blank', rel: 'noopener', text: 'Nager.Date (date.nager.at)' }),
        ' · 받은 시각 ' + atText + ' · ' + parts.join(', ')),
      loaded.notes.length ? h('p', { class: 'warn', text: loaded.notes.join(' ') }) : null,
      h('p', { class: 'hint', text: '임시공휴일은 데이터에 늦게 반영될 수 있습니다. 마감 직전에는 반드시 공식 공고를 확인하세요.' }),
      now.fixed ? h('p', { class: 'hint', text: '테스트 모드: 오늘을 ' + now.ymd + ' ' + now.hm + '로 고정해서 계산 중입니다.' }) : null
    ];
    rows.filter(Boolean).forEach((r) => container.append(r));
  }

  root.Render = { h, list, summary, footer, deadlineText };
})(typeof window !== 'undefined' ? window : globalThis);
