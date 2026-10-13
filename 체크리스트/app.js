// app.js — izzyma 화면. 규칙과 저장은 storage.js가 한다.
(function () {
  'use strict';
  const Z = window.Izzyma;
  const $ = (id) => document.getElementById(id);

  let data = Z.load();
  let confirmKey = null;   // 인라인 확인 단계에 있는 동작 이름 (브라우저 confirm()은 쓰지 않는다)
  let settingsOpen = false;
  let exportText = '';

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'value') el.value = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    kids.forEach((c) => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c)); });
    return el;
  }

  function commit() {
    if (!Z.save(data)) toast('이 브라우저가 저장을 막고 있어요. 새로고침하면 사라질 수 있어요.');
  }
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
  }

  // ── 라우팅: #/ · #/list/<id> · #/task/new · #/task/<id> · #/templates ──
  function route() {
    const parts = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    return { name: parts[0] || 'home', id: parts[1] || null };
  }
  const go = (hash) => { confirmKey = null; location.hash = hash; };
  window.addEventListener('hashchange', () => { confirmKey = null; render(); window.scrollTo(0, 0); });

  function render() {
    const r = route();
    const view = $('view');
    view.textContent = '';
    $('back').hidden = r.name === 'home';
    $('menu-btn').setAttribute('aria-expanded', settingsOpen ? 'true' : 'false');
    renderSettings();
    if (r.name === 'list') return viewList(view, r.id);
    if (r.name === 'task') return viewTask(view, r.id);
    if (r.name === 'templates') return viewTemplates(view);
    $('screen-title').textContent = 'izzyma';
    return viewHome(view);
  }

  // ── 홈 ──
  function viewHome(view) {
    const today = Z.todayYmd();
    const tasks = Z.sortTasks(data.tasks);
    const open = tasks.filter((t) => !t.done);
    const dueToday = tasks.filter((t) => Z.isToday(t, today) || (t.done && t.due === today));

    view.append(h('p', { class: 'hello', text: '깜빡하지 않게 챙겨줄게요' }));

    // 할 일
    const taskBox = h('section', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h2', { text: '할 일' }),
        tasks.length ? h('span', { class: 'count', text: open.length ? '남은 ' + open.length + '개' : '다 했어요' }) : null,
        dueToday.length ? h('span', { class: 'count soft', text: '오늘 ' + dueToday.filter((t) => t.done).length + '/' + dueToday.length }) : null
      ));
    if (!tasks.length) taskBox.append(h('p', { class: 'empty', text: '아직 할 일이 없어요. 아래 + 버튼으로 추가해 보세요.' }));
    const ul = h('ul', { class: 'rows' });
    tasks.forEach((t) => {
      const label = Z.dueLabel(t, today);
      ul.append(h('li', { class: 'row' + (t.done ? ' done' : '') },
        checkBtn(t.done, t.title, () => { t.done = !t.done; commit(); render(); if (t.done) toast('잘했어요! 하나 끝!'); }),
        h('button', { class: 'row-main', type: 'button', onclick: () => go('#/task/' + t.id) },
          h('span', { class: 'row-title', text: t.title }),
          h('span', { class: 'row-meta' },
            label ? h('span', { class: 'chip' + (Z.isOverdue(t, today) ? ' late' : Z.isToday(t, today) ? ' now' : ''), text: label }) : null,
            t.remind ? h('span', { class: 'chip bell', text: '🔔 ' + t.remind }) : null)
        )));
    });
    taskBox.append(ul);
    view.append(taskBox);

    // 체크리스트
    const listBox = h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', { text: '내 체크리스트' })));
    const grid = h('div', { class: 'grid' });
    data.lists.forEach((l) => {
      const p = Z.progress(l);
      grid.append(h('button', { class: 'tile' + (p.complete ? ' complete' : ''), type: 'button', onclick: () => go('#/list/' + l.id) },
        h('span', { class: 'tile-emoji', 'aria-hidden': 'true', text: l.emoji }),
        h('span', { class: 'tile-name', text: l.name }),
        h('span', { class: 'bar-track', 'aria-hidden': 'true' }, h('span', { class: 'bar-fill', style: 'width:' + (p.total ? Math.round(p.done / p.total * 100) : 0) + '%' })),
        h('span', { class: 'tile-count', text: p.done + '/' + p.total })));
    });
    grid.append(newListTile());
    listBox.append(grid);
    listBox.append(h('div', { class: 'links' },
      h('button', { class: 'text-btn', type: 'button', onclick: () => go('#/templates') }, '내 틀 보기 (' + data.templates.length + ')')));
    view.append(listBox);

    view.append(h('button', { class: 'fab', type: 'button', onclick: () => go('#/task/new'), 'aria-label': '할 일 추가' }, '+ 할 일'));
  }

  function newListTile() {
    const box = h('form', { class: 'tile new', onsubmit: (e) => {
      e.preventDefault();
      const name = box.elements.name.value.trim();
      if (!name) { box.elements.name.focus(); return; }
      const l = Z.makeList(name, box.elements.emoji.value.trim() || '📝', []);
      data.lists.push(l); commit(); go('#/list/' + l.id);
    } },
      h('input', { name: 'emoji', class: 'emoji-in', maxlength: '2', placeholder: '📝', 'aria-label': '이모지' }),
      h('input', { name: 'name', class: 'name-in', maxlength: '30', placeholder: '+ 새 체크리스트', autocomplete: 'off', 'aria-label': '새 체크리스트 이름' }),
      h('button', { type: 'submit', class: 'mini' }, '만들기'));
    return box;
  }

  function checkBtn(done, label, onclick) {
    return h('button', { class: 'check' + (done ? ' on' : ''), type: 'button', role: 'checkbox', 'aria-checked': done ? 'true' : 'false', 'aria-label': label, onclick },
      h('span', { class: 'tick', 'aria-hidden': 'true', text: done ? '✓' : '' }));
  }

  // ── 체크리스트 상세 ──
  function viewList(view, id) {
    const list = data.lists.find((l) => l.id === id);
    if (!list) { $('screen-title').textContent = 'izzyma'; view.append(h('p', { class: 'empty', text: '체크리스트를 찾을 수 없어요.' })); return; }
    $('screen-title').textContent = list.emoji + ' ' + list.name;
    const p = Z.progress(list);

    view.append(h('div', { class: 'progress-head' },
      h('span', { class: 'big', text: p.done + '/' + p.total }),
      h('span', { class: 'bar-track wide', 'aria-hidden': 'true' }, h('span', { class: 'bar-fill', style: 'width:' + (p.total ? Math.round(p.done / p.total * 100) : 0) + '%' }))));
    if (p.complete) view.append(h('div', { class: 'done-banner', role: 'status' }, '🎉 다 챙겼어요! 이제 나가도 돼요.'));

    const ul = h('ul', { class: 'rows' });
    list.items.forEach((it) => {
      ul.append(h('li', { class: 'row' + (it.done ? ' done' : '') },
        checkBtn(it.done, it.text, () => { it.done = !it.done; commit(); render(); }),
        h('span', { class: 'row-title grow', text: it.text }),
        h('button', { class: 'x', type: 'button', 'aria-label': it.text + ' 삭제', onclick: () => { list.items = list.items.filter((x) => x.id !== it.id); commit(); render(); } }, '×')));
    });
    if (!list.items.length) view.append(h('p', { class: 'empty', text: '아직 항목이 없어요. 아래에 적어 보세요.' }));
    view.append(ul);

    const add = h('form', { class: 'add', onsubmit: (e) => {
      e.preventDefault();
      const t = add.elements.text.value.trim();
      if (!t) return;
      list.items.push({ id: Z.uid(), text: t, done: false });
      commit(); render();
      const next = document.querySelector('.add input'); if (next) next.focus();
    } },
      h('input', { name: 'text', maxlength: '60', placeholder: '+ 항목 추가', autocomplete: 'off', enterkeyhint: 'done', 'aria-label': '새 항목' }),
      h('button', { type: 'submit', class: 'mini' }, '추가'));
    view.append(add);

    view.append(h('div', { class: 'actions' },
      confirmable('reset', '체크 초기화', '정말 체크를 모두 지울까요?', () => { Z.resetChecks(list); commit(); render(); toast('체크를 모두 지웠어요. 다시 쓸 수 있어요.'); }),
      h('button', { class: 'btn', type: 'button', onclick: () => {
        const existing = data.templates.find((t) => t.name === list.name);
        const tpl = Z.listToTemplate(list);
        if (existing) { tpl.id = existing.id; data.templates = data.templates.map((t) => (t.id === existing.id ? tpl : t)); } else data.templates.push(tpl);
        commit(); toast('틀로 저장했어요: ' + list.name);
      } }, '틀로 저장'),
      confirmable('del', '목록 삭제', '이 체크리스트를 지울까요?', () => { data.lists = data.lists.filter((l) => l.id !== id); commit(); go('#/'); }, 'danger')));
  }

  // 한 번 누르면 확인 문구가 나오고, 한 번 더 눌러야 실행되는 버튼
  function confirmable(key, label, question, onYes, cls) {
    if (confirmKey !== key) return h('button', { class: 'btn ' + (cls || ''), type: 'button', onclick: () => { confirmKey = key; render(); } }, label);
    return h('span', { class: 'confirm' },
      h('span', { text: question }),
      h('button', { class: 'btn ' + (cls || 'primary'), type: 'button', onclick: () => { confirmKey = null; onYes(); } }, '네'),
      h('button', { class: 'btn', type: 'button', onclick: () => { confirmKey = null; render(); } }, '아니요'));
  }

  // ── 할 일 추가·수정 ──
  function viewTask(view, id) {
    const isNew = id === 'new';
    const task = isNew ? { id: Z.uid(), title: '', due: '', remind: '', done: false, notified: '' } : data.tasks.find((t) => t.id === id);
    if (!task) { view.append(h('p', { class: 'empty', text: '할 일을 찾을 수 없어요.' })); return; }
    $('screen-title').textContent = isNew ? '할 일 추가' : '할 일 수정';

    const kind = { v: 'task' };
    const form = h('form', { class: 'form', onsubmit: (e) => {
      e.preventDefault();
      const title = form.elements.title.value.trim();
      if (!title) { msg('제목을 적어 주세요.'); form.elements.title.focus(); return; }
      if (kind.v === 'pack') {
        const l = data.lists.find((x) => x.id === form.elements.list.value);
        if (!l) { msg('준비물을 넣을 체크리스트를 골라 주세요.'); return; }
        l.items.push({ id: Z.uid(), text: title, done: false });
        commit(); go('#/list/' + l.id); toast('준비물에 추가했어요.'); return;
      }
      const remindOn = form.elements.remindOn.checked;
      const due = form.elements.due.value, remind = form.elements.remind.value;
      if (remindOn && !due) { msg('알림을 켜려면 마감일을 골라 주세요.'); return; }
      if (remindOn && !remind) { msg('알림 시간을 골라 주세요.'); return; }
      task.title = title; task.due = due; task.remind = remindOn ? remind : '';
      if (remindOn) task.notified = '';
      if (isNew) data.tasks.push(task);
      commit(); go('#/');
      if (remindOn) maybeAskPermission();
    } },
      h('label', null, '제목', h('input', { name: 'title', maxlength: '60', value: task.title, placeholder: '예: 병원 예약 전화', autocomplete: 'off' })),
      isNew ? h('div', { class: 'seg', role: 'group', 'aria-label': '구분' },
        h('button', { type: 'button', class: 'on', 'aria-pressed': 'true', onclick: (e) => setKind('task', e) }, '할 일'),
        h('button', { type: 'button', 'aria-pressed': 'false', onclick: (e) => setKind('pack', e) }, '준비물')) : null,
      h('div', { id: 'task-fields' },
        h('label', null, '마감일', h('input', { name: 'due', type: 'date', value: task.due })),
        h('label', { class: 'switch-row' },
          h('input', { name: 'remindOn', type: 'checkbox', checked: task.remind ? true : null }), '알림 받기',
          h('input', { name: 'remind', type: 'time', value: task.remind || '09:00', 'aria-label': '알림 시간' }))),
      h('div', { id: 'pack-fields', hidden: true },
        h('label', null, '넣을 체크리스트',
          (() => { const s = h('select', { name: 'list' }); data.lists.forEach((l) => s.append(new Option(l.emoji + ' ' + l.name, l.id))); return s; })()),
        data.lists.length ? null : h('p', { class: 'hint', text: '먼저 홈에서 체크리스트를 하나 만들어 주세요.' })),
      h('p', { id: 'form-msg', class: 'form-msg', role: 'alert' }),
      h('div', { class: 'actions' },
        h('button', { type: 'submit', class: 'btn primary' }, '저장'),
        isNew ? null : confirmable('deltask', '삭제', '이 할 일을 지울까요?', () => { data.tasks = data.tasks.filter((t) => t.id !== task.id); commit(); go('#/'); }, 'danger')));

    function setKind(k, e) {
      kind.v = k;
      form.querySelectorAll('.seg button').forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      $('task-fields').hidden = k === 'pack';
      $('pack-fields').hidden = k !== 'pack';
    }
    function msg(t) { $('form-msg').textContent = t; }
    view.append(form);
  }

  // ── 틀 ──
  function viewTemplates(view) {
    $('screen-title').textContent = '내 틀';
    if (!data.templates.length) {
      view.append(h('p', { class: 'empty', text: '저장한 틀이 없어요. 체크리스트 화면에서 "틀로 저장"을 눌러 보세요.' }));
      view.append(h('button', { class: 'btn', type: 'button', onclick: () => {
        data.templates.push(
          { id: Z.uid(), name: '외출 준비물', emoji: '🎒', items: ['지갑', '폰 충전기', '우산', '에어팟', '열쇠'] },
          { id: Z.uid(), name: '여행 짐', emoji: '🧳', items: ['여권', '숙소 예약 확인', '충전기', '세면도구', '갈아입을 옷', '상비약'] });
        commit(); render();
      } }, '예시 틀 2개 넣기'));
      return;
    }
    const ul = h('ul', { class: 'rows' });
    data.templates.forEach((t) => {
      ul.append(h('li', { class: 'row' },
        h('span', { class: 'tile-emoji', 'aria-hidden': 'true', text: t.emoji }),
        h('span', { class: 'row-title grow' }, t.name, h('span', { class: 'row-sub', text: ' · ' + t.items.length + '개' })),
        h('button', { class: 'btn small primary', type: 'button', onclick: () => {
          const l = Z.templateToList(t); data.lists.push(l); commit(); go('#/list/' + l.id); toast('체크가 모두 비어 있는 새 목록을 만들었어요.');
        } }, '불러오기'),
        h('button', { class: 'x', type: 'button', 'aria-label': t.name + ' 틀 삭제', onclick: () => { data.templates = data.templates.filter((x) => x.id !== t.id); commit(); render(); } }, '×')));
    });
    view.append(ul);
  }

  // ── 설정: 알림, 내보내기/가져오기(로그인 대신 기기 간 옮기기) ──
  function renderSettings() {
    const box = $('settings');
    const keep = $('io') ? $('io').value : null; // 다시 그려도 붙여 넣은 글이 사라지지 않게 한다
    box.hidden = !settingsOpen;
    box.textContent = '';
    if (!settingsOpen) return;
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    box.append(
      h('h2', { text: '설정' }),
      h('div', { class: 'set-row' },
        h('span', { text: '알림: ' + ({ granted: '켜짐', denied: '브라우저에서 막힘', default: '아직 허용 안 함', unsupported: '이 브라우저는 지원 안 함' }[perm]) }),
        perm === 'default' ? h('button', { class: 'btn small', type: 'button', onclick: () => askPermission() }, '알림 허용') : null),
      h('p', { class: 'hint', text: '알림은 이 페이지가 열려 있는 동안에만 울려요. 닫혀 있을 때도 받으려면 서버가 필요해서 아직 넣지 않았어요. 폰에서는 홈 화면에 추가하면 더 잘 동작해요.' }),
      h('div', { class: 'set-row' },
        h('button', { class: 'btn small', type: 'button', onclick: () => { exportText = Z.exportJson(data); renderSettings(); copyExport(); } }, '내보내기'),
        h('button', { class: 'btn small', type: 'button', onclick: () => { exportText = ''; if ($('io')) $('io').value = ''; renderSettings(); if ($('io')) $('io').focus(); } }, '가져오기 칸 비우기')),
      h('textarea', { id: 'io', rows: '4', placeholder: '내보낸 글을 여기에 붙여 넣고 "가져오기"를 누르세요.', 'aria-label': '내보내기·가져오기 글' }),
      h('div', { class: 'set-row' },
        confirmable('import', '가져오기', '지금 내용을 덮어써도 될까요?', () => {
          const r = Z.importJson($('io').value.trim());
          if (!r.ok) { toast(r.error); return; }
          data = r.data; commit(); settingsOpen = false; go('#/'); render(); toast('가져왔어요.');
        })),
      h('p', { class: 'hint', text: '구글 로그인과 자동 동기화는 아직 없어요. 폰과 컴퓨터에서 같은 내용을 쓰려면 한쪽에서 내보내고 다른 쪽에서 가져오세요.' }));
    const io = $('io'); if (io) io.value = keep ? keep : exportText;
  }
  function copyExport() {
    const io = $('io'); if (io) { io.value = exportText; io.focus(); io.select(); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(exportText).then(() => toast('복사했어요. 다른 기기에서 가져오기에 붙여 넣으세요.'), () => toast('아래 글을 직접 선택해 복사해 주세요.'));
    else toast('아래 글을 직접 선택해 복사해 주세요.');
  }

  // ── 알림 ──
  function askPermission() {
    if (!('Notification' in window)) { toast('이 브라우저는 알림을 지원하지 않아요.'); return; }
    Notification.requestPermission().then((p) => { toast(p === 'granted' ? '알림을 켰어요.' : '알림이 허용되지 않았어요.'); renderSettings(); });
  }
  function maybeAskPermission() { if ('Notification' in window && Notification.permission === 'default') askPermission(); }

  function checkReminders() {
    const now = new Date();
    const due = Z.dueReminders(data.tasks, now);
    if (!due.length) return;
    due.forEach((t) => {
      t.notified = Z.todayYmd(now) + ' ' + t.remind;
      toast('🔔 ' + t.title + ' (' + (Z.dueLabel(t, Z.todayYmd(now)) || '오늘') + ')');
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('izzyma', { body: t.title, tag: t.id }); } catch (e) { /* 일부 모바일 브라우저는 생성자를 막는다 */ }
      }
    });
    commit();
    if (route().name === 'home') render();
  }

  function init() {
    $('back').addEventListener('click', () => { if (history.length > 1) history.back(); else go('#/'); });
    $('menu-btn').addEventListener('click', () => { settingsOpen = !settingsOpen; renderSettings(); $('menu-btn').setAttribute('aria-expanded', settingsOpen ? 'true' : 'false'); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); });
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
    render();
    checkReminders();
    setInterval(checkReminders, 30000);
  }
  init();
})();
