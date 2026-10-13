// storage.js — izzyma의 데이터와 규칙. 화면(app.js)과 분리해 둔 순수한 부분.
// 저장은 이 브라우저의 localStorage에만 한다. 로그인도 서버도 없다.
(function (root) {
  'use strict';

  const KEY = 'izzyma.data.v1';
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  const todayYmd = (d) => { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const nowHm = (d) => { d = d || new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };

  // 데이터 모양
  //  lists:     { id, name, emoji, items:[{id,text,done}], createdAt }   체크리스트(준비물)
  //  tasks:     { id, title, due:'YYYY-MM-DD'|'', remind:'HH:MM'|'', done, notified:'YYYY-MM-DD HH:MM'|'' }   할 일
  //  templates: { id, name, emoji, items:[text] }   자주 쓰는 틀
  function empty() { return { v: 1, lists: [], tasks: [], templates: [] }; }

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && d.v === 1 && Array.isArray(d.lists) && Array.isArray(d.tasks) && Array.isArray(d.templates)) return d;
    } catch (e) { /* 깨진 데이터는 새로 시작한다 */ }
    return empty();
  }
  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  }

  // ── 체크리스트 ──
  function progress(list) {
    const total = list.items.length;
    const done = list.items.filter((i) => i.done).length;
    return { done, total, complete: total > 0 && done === total };
  }
  function resetChecks(list) { list.items.forEach((i) => { i.done = false; }); }
  function makeList(name, emoji, texts) {
    return { id: uid(), name, emoji: emoji || '📝', items: (texts || []).map((t) => ({ id: uid(), text: t, done: false })), createdAt: Date.now() };
  }

  // ── 틀 ──
  function listToTemplate(list) { return { id: uid(), name: list.name, emoji: list.emoji, items: list.items.map((i) => i.text) }; }
  // 틀을 불러오면 체크가 모두 비어 있는 새 체크리스트가 만들어진다.
  function templateToList(tpl) { return makeList(tpl.name, tpl.emoji, tpl.items); }

  // ── 할 일 ──
  // 마감이 가까운 것이 위로, 끝낸 것은 아래로. 마감이 없는 것은 마감 있는 것 다음.
  function sortTasks(tasks) {
    return tasks.slice().sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (!!a.due !== !!b.due) return a.due ? -1 : 1;
      return (a.due + (a.remind || '24:00')).localeCompare(b.due + (b.remind || '24:00'));
    });
  }
  function dueLabel(task, today) {
    if (!task.due) return '';
    const a = Date.UTC(...task.due.split('-').map((n, i) => (i === 1 ? n - 1 : +n)));
    const b = Date.UTC(...today.split('-').map((n, i) => (i === 1 ? n - 1 : +n)));
    const diff = Math.round((a - b) / 86400000);
    if (diff < 0) return Math.abs(diff) + '일 지남';
    if (diff === 0) return '오늘';
    if (diff === 1) return '내일';
    return diff + '일 남음';
  }
  const isOverdue = (task, today) => !task.done && !!task.due && task.due < today;
  const isToday = (task, today) => !task.done && task.due === today;

  // 지금 알려야 할 할 일을 고른다. 같은 날 같은 시각에는 한 번만 알린다.
  function dueReminders(tasks, now) {
    const today = todayYmd(now), hm = nowHm(now);
    return tasks.filter((t) => !t.done && t.remind && t.due === today && t.remind <= hm && t.notified !== today + ' ' + t.remind);
  }

  // ── 내보내기/가져오기: 로그인 대신, 다른 기기로 옮기는 방법 ──
  function exportJson(data) { return JSON.stringify(data); }
  function importJson(text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { return { ok: false, error: '글이 올바른 형식이 아닙니다.' }; }
    if (!d || d.v !== 1 || !Array.isArray(d.lists) || !Array.isArray(d.tasks) || !Array.isArray(d.templates)) {
      return { ok: false, error: 'izzyma에서 내보낸 글이 아닙니다.' };
    }
    return { ok: true, data: d };
  }

  const api = {
    KEY, uid, todayYmd, nowHm, empty, load, save,
    progress, resetChecks, makeList, listToTemplate, templateToList,
    sortTasks, dueLabel, isOverdue, isToday, dueReminders, exportJson, importJson
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Izzyma = api;
})(typeof window !== 'undefined' ? window : globalThis);
