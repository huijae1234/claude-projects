// app.js — 입력·저장·화면 갱신을 이어 주는 파일. 계산은 rules.js, 공휴일은 api.js, 그리기는 render.js가 한다.
(function () {
  'use strict';
  const Rl = window.Rules, Api = window.Api, Rd = window.Render;
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = 'maegam.entries.v1';

  // ?fixture=1  → 인터넷 없이 고정 파일로 그린다.
  // ?today=2026-10-07&time=09:00 → "오늘"을 고정해서 같은 화면이 나오게 한다.
  const q = new URLSearchParams(location.search);
  const useFixture = q.get('fixture') === '1';
  const override = q.get('today') ? { today: q.get('today'), time: q.get('time') } : null;

  let entries = load();
  let holidays = new Map();
  let loaded = { list: [], sources: [], notes: [] };
  let editingId = null;
  let loadedYears = new Set();

  function load() {
    try { const v = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(entries)); } catch (e) { setMsg('이 브라우저는 저장을 막고 있어서 새로고침하면 사라집니다.', true); }
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const now = () => Rl.kstNow(override);

  function setMsg(text, isErr) {
    const el = $('msg');
    el.textContent = text || '';
    el.className = 'msg' + (isErr ? ' err' : '');
  }

  // ── 공휴일: 필요한 해만 가져온다 ──
  function neededYears() {
    const y = Number(now().ymd.slice(0, 4));
    const set = new Set([y, y + 1]);
    entries.forEach((e) => { if (Rl.isValidYmd(e.date)) set.add(Number(e.date.slice(0, 4))); });
    return [...set].sort();
  }
  async function ensureHolidays() {
    const years = neededYears();
    if (years.every((y) => loadedYears.has(y))) return;
    loaded = await Api.loadHolidays(years, { fixture: useFixture });
    holidays = Rl.holidayMap(loaded.list);
    years.forEach((y) => loadedYears.add(y));
  }

  // ── 화면 갱신 ──
  function draw() {
    const n = now();
    const sorted = Rl.sortEntries(entries, n, holidays);
    Rd.summary($('summary'), sorted);
    Rd.list($('list'), sorted, n, holidays, { onStatus, onEdit, onDelete });
    Rd.footer($('foot'), n, loaded);
    $('today').textContent = Rl.fmtMdW(n.ymd) + ' ' + n.hm + (n.fixed ? ' (고정)' : '') + ' · 한국 시간';
    $('clear-examples').hidden = !entries.some((e) => e.example);
  }
  async function refresh() { await ensureHolidays(); draw(); }

  // ── 카드에서 오는 동작 ──
  function onStatus(id, value) {
    const e = entries.find((x) => x.id === id);
    if (e) { e.status = value; save(); draw(); }
  }
  function onDelete(id) {
    entries = entries.filter((x) => x.id !== id);
    if (editingId === id) resetForm();
    save(); draw();
  }
  function onEdit(id) {
    const e = entries.find((x) => x.id === id);
    if (!e) return;
    editingId = id;
    $('company').value = e.company;
    $('site').value = e.site;
    $('type').value = e.type === 'dminus' ? 'datetime' : e.type;
    $('date').value = e.date || '';
    $('time').value = e.time || '';
    $('submit-date').value = e.submitDate || '';
    $('status').value = e.status;
    $('form-title').textContent = '공고 수정';
    $('submit-btn').textContent = '저장';
    $('cancel-edit').hidden = false;
    syncTypeFields();
    $('company').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── 입력 폼 ──
  function syncTypeFields() {
    const t = $('type').value;
    $('f-date').hidden = t !== 'datetime';
    $('f-time').hidden = t !== 'datetime';
    $('f-dminus').hidden = t !== 'dminus';
    $('f-submit').hidden = t === 'closing' || t === 'always';
  }
  function resetForm() {
    editingId = null;
    $('entry-form').reset();
    $('type').value = 'datetime';
    $('form-title').textContent = '공고 추가';
    $('submit-btn').textContent = '추가';
    $('cancel-edit').hidden = true;
    syncTypeFields();
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    const company = $('company').value.trim();
    const type = $('type').value;
    if (!company) { setMsg('회사·공고명을 적어 주세요.', true); $('company').focus(); return; }

    const e = {
      id: editingId || uid(), company, site: $('site').value, type,
      status: $('status').value, submitDate: '', createdYmd: now().ymd
    };
    if (type === 'datetime') {
      const date = $('date').value, time = $('time').value || '23:59';
      if (!Rl.isValidYmd(date)) { setMsg('마감 날짜를 골라 주세요.', true); $('date').focus(); return; }
      if (!Rl.isValidHm(time)) { setMsg('마감 시각을 HH:MM 형식으로 적어 주세요.', true); return; }
      e.date = date; e.time = time;
    } else if (type === 'dminus') {
      const n = Number($('dminus').value);
      if (!Number.isInteger(n) || n < 0 || n > 365) { setMsg('D-n의 n은 0~365 사이 정수로 적어 주세요.', true); $('dminus').focus(); return; }
      // 입력한 날을 기준으로 날짜로 바꿔 저장한다. 그래야 내일 열어도 마감일이 밀리지 않는다.
      const c = Rl.dminusToDeadline(now().ymd, n);
      e.type = 'datetime'; e.date = c.date; e.time = c.time; e.origin = 'D-' + n;
    }
    if (type === 'datetime' || type === 'dminus') {
      const sd = $('submit-date').value;
      if (sd) {
        if (!Rl.isValidYmd(sd)) { setMsg('제출 목표일이 올바르지 않습니다.', true); return; }
        if (e.date && sd > e.date) { setMsg('제출 목표일이 마감일보다 늦습니다. 날짜를 확인해 주세요.', true); return; }
        e.submitDate = sd;
      }
    }

    if (editingId) entries = entries.map((x) => (x.id === editingId ? Object.assign({}, x, e) : x));
    else entries.push(e);
    save();
    setMsg(editingId ? '수정했습니다.' : '추가했습니다.');
    resetForm();
    await refresh();
  }

  // ── 예시 5건: 오늘을 기준으로 만들어서 화면이 늘 살아 있게 한다 ──
  function addExamples() {
    const t = now().ymd;
    const mk = (company, site, extra) => Object.assign({ id: uid(), company, site, type: 'datetime', status: '지원 전', example: true, submitDate: '' }, extra);
    const d5 = Rl.addDays(t, 5);
    entries.push(
      mk('예시식품(주) 생산관리', '사람인', { date: d5, time: '18:00' }),
      mk('예시푸드 품질관리 신입', '원티드', { date: Rl.dminusToDeadline(t, 3).date, time: '23:59', origin: 'D-3' }),
      mk('예시팜 HACCP 담당', '인디스워크', { type: 'closing' }),
      mk('예시유업 생산직', '자소설닷컴', { type: 'always' }),
      mk('예시바이오 분석원', '링커리어', { date: Rl.addDays(t, 1), time: '10:00', status: '작성 중' })
    );
    save();
    return refresh();
  }

  function init() {
    Rd.h; // 로드 확인용
    const siteSel = $('site');
    Rl.SITES.forEach((s) => siteSel.append(new Option(s, s)));
    const statusSel = $('status');
    Rl.STATUSES.forEach((s) => statusSel.append(new Option(s, s)));
    const typeSel = $('type');
    ['datetime', 'dminus', 'closing', 'always'].forEach((k) => typeSel.append(new Option(Rl.TYPES[k], k)));

    typeSel.addEventListener('change', syncTypeFields);
    $('entry-form').addEventListener('submit', onSubmit);
    $('cancel-edit').addEventListener('click', () => { resetForm(); setMsg(''); });
    $('add-examples').addEventListener('click', addExamples);
    $('clear-examples').addEventListener('click', () => { entries = entries.filter((e) => !e.example); save(); draw(); });

    resetForm();
    refresh();
    setInterval(draw, 60000); // 시간이 흐르면 "마감됨"과 신호등이 바뀐다
  }
  init();
})();
