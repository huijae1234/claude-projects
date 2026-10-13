// rules.js — "마감 한눈에"의 판단 규칙. 화면(render.js)과 분리된 순수 함수만 둔다.
// 날짜는 모두 'YYYY-MM-DD' 문자열, 시각은 'HH:MM' 문자열로 다룬다. 기준 시간대는 한국 표준시(Asia/Seoul).
(function (root) {
  'use strict';

  // ── 바꾸기 쉽게 파일 맨 위에 둔 기준값 ──
  const SIGNAL = {
    REDCALENDARDAYS: 1,   // 달력으로 내일까지면 빨강 (오늘 마감 포함)
    ORANGEBUSINESSDAYS: 3 // 남은 영업일이 이 값 이하면 주황
  };
  const SITES = ['사람인', '원티드', '인디스워크', '자소설닷컴', '링커리어'];
  const STATUSES = ['지원 전', '작성 중', '제출 완료'];
  const TYPES = {
    datetime: '날짜와 시간',
    dminus: 'D-n 표기',
    closing: '채용 시 마감',
    always: '상시'
  };

  // ── 날짜 도구 (UTC 기준으로만 계산해서 실행하는 PC의 시간대에 영향받지 않는다) ──
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  const ymdToMs = (ymd) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const msToYmd = (ms) => {
    const d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  };
  const addDays = (ymd, n) => msToYmd(ymdToMs(ymd) + n * 86400000);
  const diffDays = (fromYmd, toYmd) => Math.round((ymdToMs(toYmd) - ymdToMs(fromYmd)) / 86400000);
  const weekday = (ymd) => new Date(ymdToMs(ymd)).getUTCDay(); // 0=일 … 6=토
  const isWeekend = (ymd) => weekday(ymd) === 0 || weekday(ymd) === 6;
  const isValidYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && msToYmd(ymdToMs(s)) === s;
  const isValidHm = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '');
  const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
  const fmtMd = (ymd) => Number(ymd.slice(5, 7)) + '/' + Number(ymd.slice(8, 10));
  const fmtMdW = (ymd) => fmtMd(ymd) + '(' + WEEKDAY_KO[weekday(ymd)] + ')';

  // 한국 시간 기준의 지금. override가 있으면 "오늘"을 고정한다(?today=2026-10-07 로 같은 화면을 다시 볼 때).
  function kstNow(override) {
    if (override && isValidYmd(override.today)) {
      return { ymd: override.today, hm: isValidHm(override.time) ? override.time : '09:00', fixed: true };
    }
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const g = (t) => parts.find((p) => p.type === t).value;
    return { ymd: g('year') + '-' + g('month') + '-' + g('day'), hm: g('hour') + ':' + g('minute'), fixed: false };
  }

  // holidays: Map('YYYY-MM-DD' → 공휴일 이름)
  function holidayMap(list) {
    const m = new Map();
    (list || []).forEach((h) => { if (h && h.date) m.set(h.date, h.localName || h.name || '공휴일'); });
    return m;
  }
  const isBusinessDay = (ymd, holidays) => !isWeekend(ymd) && !holidays.has(ymd);

  // 오늘 다음 날부터 마감일까지(마감일 포함) 중 쉬는 날을 뺀 날 수.
  // 마감일이 영업일이면 마감일도 센다. "마감 시각 전인지"는 analyze()가 먼저 걸러 준다.
  function businessDaysLeft(todayYmd, deadlineYmd, holidays) {
    let count = 0;
    const skippedHolidays = []; // 평일인데 공휴일이라 빠진 날
    let weekendDays = 0;
    for (let d = addDays(todayYmd, 1); diffDays(d, deadlineYmd) >= 0; d = addDays(d, 1)) {
      if (isWeekend(d)) weekendDays++;
      else if (holidays.has(d)) skippedHolidays.push({ date: d, name: holidays.get(d) });
      else count++;
    }
    return { count, skippedHolidays, weekendDays };
  }

  // 제출 목표일을 비웠을 때: 마감일 바로 앞 영업일을 제안한다.
  function suggestSubmitDate(deadlineYmd, holidays) {
    let d = addDays(deadlineYmd, -1);
    for (let i = 0; i < 40; i++, d = addDays(d, -1)) if (isBusinessDay(d, holidays)) return d;
    return null;
  }

  // D-n 표기를 입력한 날 기준의 날짜로 바꾼다. 시각이 없으니 그날 끝(23:59)으로 본다.
  function dminusToDeadline(todayYmd, n) {
    return { date: addDays(todayYmd, Number(n)), time: '23:59' };
  }

  // 한 건을 판단한다. 화면은 이 결과(숫자·색 이름·문구)를 그리기만 한다.
  function analyze(entry, now, holidays) {
    const status = entry.status || STATUSES[0];
    const base = { id: entry.id, status, tone: 'gray', badge: '', headline: '', detail: '', sortKey: 9e15, group: 2 };

    if (status === '제출 완료') {
      return Object.assign(base, { tone: 'done', badge: '제출 완료', headline: '제출 완료', group: 4 });
    }
    if (entry.type === 'closing') {
      return Object.assign(base, { tone: 'gray', badge: '채용 시 마감', headline: '채용 시 마감', detail: '마감일이 정해져 있지 않습니다. 공고를 자주 확인하세요.', group: 1 });
    }
    if (entry.type === 'always') {
      return Object.assign(base, { tone: 'gray', badge: '상시', headline: '상시 채용', detail: '언제든 지원할 수 있지만 조기 마감될 수 있습니다.', group: 2 });
    }

    const date = entry.date, time = entry.time || '23:59';
    if (!isValidYmd(date)) {
      return Object.assign(base, { tone: 'gray', badge: '날짜 확인', headline: '날짜를 확인하세요', group: 3 });
    }
    const sortKey = ymdToMs(date) + (Number(time.slice(0, 2)) * 60 + Number(time.slice(3))) * 60000;
    const cal = diffDays(now.ymd, date);

    if (cal < 0 || (cal === 0 && time <= now.hm)) {
      return Object.assign(base, { tone: 'gray', badge: '마감됨', headline: '마감됨', detail: fmtMdW(date) + ' ' + time + '에 마감되었습니다.', sortKey, group: 3 });
    }
    if (cal === 0) {
      return Object.assign(base, { tone: 'red', badge: '오늘 마감', headline: '오늘 ' + time + ' 마감', detail: '', sortKey, group: 0, calendarDays: 0, businessDays: 0 });
    }

    const left = businessDaysLeft(now.ymd, date, holidays);
    let tone = 'green';
    if (cal <= SIGNAL.REDCALENDARDAYS) tone = 'red';
    else if (left.count <= SIGNAL.ORANGEBUSINESSDAYS) tone = 'orange';

    // 왜 달력 날짜와 영업일이 다른지 한 문장으로 설명한다.
    let why = '';
    const reasons = left.skippedHolidays.map((h) => h.name + '(' + fmtMd(h.date) + ')');
    if (left.weekendDays) reasons.push('주말 ' + left.weekendDays + '일');
    if (cal !== left.count) {
      why = '달력으로는 ' + cal + '일, ' + (reasons.length ? reasons.join('·') + ' 제외해 ' : '') + '영업일로는 ' + left.count + '일';
    } else {
      why = '달력으로도 ' + cal + '일 (쉬는 날 없음)';
    }

    const dayWord = cal === 1 ? '내일' : '';
    return Object.assign(base, {
      tone,
      badge: '영업일 ' + left.count + '일',
      headline: (dayWord ? dayWord + ' ' + time + ' 마감 · ' : '') + '영업일 ' + left.count + '일 남음',
      detail: why,
      sortKey, group: 0,
      calendarDays: cal, businessDays: left.count,
      skippedHolidays: left.skippedHolidays, weekendDays: left.weekendDays
    });
  }

  // 임박한 순으로 정렬: 마감일 있는 것(임박순) → 채용 시 마감 → 상시 → 마감됨 → 제출 완료
  function sortEntries(entries, now, holidays) {
    return entries
      .map((e) => ({ entry: e, result: analyze(e, now, holidays) }))
      .sort((a, b) => a.result.group - b.result.group || a.result.sortKey - b.result.sortKey);
  }

  const api = {
    SIGNAL, SITES, STATUSES, TYPES,
    pad, addDays, diffDays, weekday, isWeekend, isValidYmd, isValidHm, fmtMd, fmtMdW, WEEKDAY_KO,
    kstNow, holidayMap, isBusinessDay, businessDaysLeft, suggestSubmitDate, dminusToDeadline, analyze, sortEntries
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Rules = api;
})(typeof window !== 'undefined' ? window : globalThis);
