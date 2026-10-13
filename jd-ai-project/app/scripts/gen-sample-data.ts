/**
 * 유가공·육가공 가상 샘플 데이터 생성 (시드 고정 → 항상 같은 결과).
 * 실행: npx tsx scripts/gen-sample-data.ts
 * 출력: ../sample-data/data/equipment_dairy_meat.csv, production_dairy_meat.csv
 * 모두 가상 데이터이며 실제 설비·회사와 무관하다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260630);
const gauss = (mean: number, sd: number) => {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

const OUT = fileURLToPath(new URL('../../sample-data/data/', import.meta.url));
mkdirSync(OUT, { recursive: true });

// ───────── 날짜 도우미 ─────────
const START = Date.UTC(2026, 0, 1);
const dayMs = 86400000;
const dateOf = (i: number) => new Date(START + i * dayMs).toISOString().slice(0, 10);
const idxOf = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - START) / dayMs);
const DAYS = idxOf('2026-06-30') + 1;

/** [start, end] 구간에서 0→1로 올라가는 진행도. 구간 밖이면 0(전) 또는 0(후, 수리 완료). */
const ramp = (d: number, start: string, end: string) => {
  const s = idxOf(start);
  const e = idxOf(end);
  if (d < s || d > e) return 0;
  return (d - s + 1) / (e - s + 1);
};

// ───────── 설비 정의 ─────────
interface Machine {
  id: string;
  name: string;
  area: '유가공' | '육가공';
  load: number;
  motorT: number;
  bearT: number;
  vib: number;
  cur: number;
  press?: { base: number; sd: number };
  procT?: { base: number; sd: number };
}

const MACHINES: Machine[] = [
  { id: 'HOM-01', name: '고압 균질기 1호', area: '유가공', load: 78, motorT: 62, bearT: 55, vib: 2.1, cur: 96, press: { base: 200, sd: 2 }, procT: { base: 68, sd: 0.5 } },
  { id: 'HOM-02', name: '고압 균질기 2호', area: '유가공', load: 74, motorT: 61, bearT: 54, vib: 2.0, cur: 92, press: { base: 195, sd: 2 }, procT: { base: 68, sd: 0.5 } },
  { id: 'PAS-01', name: 'UHT 판형 살균기', area: '유가공', load: 82, motorT: 58, bearT: 50, vib: 1.5, cur: 61, press: { base: 4.5, sd: 0.08 }, procT: { base: 137, sd: 0.4 } },
  { id: 'FIL-01', name: '무균 충진기', area: '유가공', load: 70, motorT: 55, bearT: 48, vib: 1.2, cur: 34 },
  { id: 'CUT-01', name: '사일런트 커터', area: '육가공', load: 85, motorT: 66, bearT: 58, vib: 3.0, cur: 118 },
  { id: 'STF-01', name: '진공 스터퍼', area: '육가공', load: 72, motorT: 59, bearT: 52, vib: 1.8, cur: 48, press: { base: 6.0, sd: 0.15 } },
  { id: 'TUM-01', name: '진공 텀블러', area: '육가공', load: 65, motorT: 57, bearT: 50, vib: 1.6, cur: 42 },
  { id: 'SMK-01', name: '훈연·조리 오븐', area: '육가공', load: 60, motorT: 52, bearT: 46, vib: 0.9, cur: 28, procT: { base: 78, sd: 0.4 } },
];

// ───────── 심어둔 시나리오 ─────────
// HOM-01: 5/20~6/10 균질 밸브/피스톤 씰 마모 → 압력 변동·진동·베어링 온도 상승 → 6/11 고장
// PAS-01: 3/25~4/14 판형 열교환기 파울링 → 압력 상승·살균온도 편차 → 4/15 CIP·가스켓 교체
// CUT-01: 5/20~ 칼날 마모 진행(현재 진행 중, 중간 위험) / 4/2 칼날 교체
// TUM-01: 6/12~ 베어링 과열·진동 상승(현재 진행 중, 높은 위험, 아직 고장 아님)
// STF-01: 3/9 호스 클램프 풀림 단발 고장 (전조 없음)
interface Event {
  date: string;
  downtime: number;
  wo: 'CM' | 'PM';
  note: string;
  breakdown: boolean;
}
const EVENTS: Record<string, Event[]> = {
  'HOM-01': [{ date: '2026-06-11', downtime: 340, wo: 'CM', note: '균질 밸브 시트 파손 및 피스톤 씰 마모, 부품 교체 후 재가동', breakdown: true }],
  'PAS-01': [{ date: '2026-04-15', downtime: 180, wo: 'CM', note: '판형 열교환기 파울링으로 CIP 조기 실시 및 가스켓 교체', breakdown: true }],
  'CUT-01': [{ date: '2026-04-02', downtime: 90, wo: 'PM', note: '칼날 교체 및 정기점검', breakdown: false }],
  'STF-01': [{ date: '2026-03-09', downtime: 45, wo: 'CM', note: '충전 호스 클램프 풀림 재체결', breakdown: true }],
};

function pmDay(date: string): boolean {
  return date.endsWith('-01');
}

const eqRows: string[] = [
  'date,machine_id,machine_name,area,runtime_h,load_pct,motor_temp_c,bearing_temp_c,vibration_mms,motor_current_a,process_pressure_bar,process_temp_c,wear_index,downtime_min,breakdown_flag,wo_type,note',
];

for (const m of MACHINES) {
  let wear = 20;
  for (let d = 0; d < DAYS; d++) {
    const date = dateOf(d);
    const ev = (EVENTS[m.id] ?? []).find((e) => e.date === date);

    // 열화 진행도 (구간 밖은 0 = 정상)
    let hom = 0;
    let pas = 0;
    let cut = 0;
    let tum = 0;
    if (m.id === 'HOM-01') hom = ramp(d, '2026-05-20', '2026-06-10') || (date === '2026-06-11' ? 1 : 0);
    if (m.id === 'PAS-01') pas = ramp(d, '2026-03-25', '2026-04-14') || (date === '2026-04-15' ? 1 : 0);
    if (m.id === 'CUT-01') cut = ramp(d, '2026-05-20', '2026-06-30');
    if (m.id === 'TUM-01') tum = ramp(d, '2026-06-12', '2026-06-30');

    let load = gauss(m.load, 3);
    let motorT = gauss(m.motorT, 0.8);
    let bearT = gauss(m.bearT, 0.7);
    let vib = gauss(m.vib, 0.08);
    let cur = gauss(m.cur * (1 + 0.2 * (load / m.load - 1)), m.cur * 0.008);
    let press = m.press ? gauss(m.press.base, m.press.sd) : NaN;
    let procT = m.procT ? gauss(m.procT.base, m.procT.sd) : NaN;

    if (hom) {
      vib += 2.6 * hom ** 1.5;
      bearT += 9 * hom;
      motorT += 4 * hom;
      press = gauss(m.press!.base, m.press!.sd * (1 + 5 * hom)); // 평균은 유지, 변동만 커짐
    }
    if (pas) {
      press += 1.8 * pas;
      procT = gauss(m.procT!.base - 1.5 * pas, m.procT!.sd * (1 + 2 * pas));
      cur += 4 * pas;
    }
    if (cut) {
      cur += m.cur * 0.06 * cut;
      vib += 0.35 * cut;
    }
    if (tum) {
      bearT += 14 * tum;
      vib += 1.2 * tum ** 1.3;
      motorT += 3 * tum;
    }

    // 마모 지표 (사일런트 커터만 기록)
    wear += 0.4 + (cut ? 0.55 * cut : 0);
    if (m.id === 'CUT-01' && date === '2026-04-02') wear = 5;

    let downtime = rand() < 0.1 ? Math.round(gauss(8, 3)) : 0;
    let wo = '';
    let note = '';
    let breakdown = 0;
    if (pmDay(date) && !ev) {
      downtime = Math.round(60 + rand() * 30);
      wo = 'PM';
      note = '정기 예방정비(윤활·점검)';
    }
    if (ev) {
      downtime = ev.downtime;
      wo = ev.wo;
      note = ev.note;
      breakdown = ev.breakdown ? 1 : 0;
    }
    downtime = Math.max(0, downtime);

    eqRows.push(
      [
        date,
        m.id,
        m.name,
        m.area,
        r1(24 - downtime / 60),
        r1(load),
        r1(motorT),
        r1(bearT),
        r3(vib),
        r2(cur),
        Number.isNaN(press) ? '' : r2(press),
        Number.isNaN(procT) ? '' : r2(procT),
        m.id === 'CUT-01' ? r1(wear) : '',
        downtime,
        breakdown,
        wo,
        note ? `"${note}"` : '',
      ].join(','),
    );
  }
}
// 날짜순 → 설비순 정렬 (실제 로그처럼)
const header = eqRows.shift()!;
eqRows.sort((a, b) => a.localeCompare(b));
writeFileSync(`${OUT}equipment_dairy_meat.csv`, [header, ...eqRows].join('\n') + '\n', 'utf8');
console.log(`equipment_dairy_meat.csv: ${eqRows.length} rows`);

// ───────── 생산 실적 (기존 도구가 기대하는 형식) ─────────
interface Line {
  line: string;
  product: string;
  planned: number;
  baseYield: number;
  minor: string[];
}
const LINES: Line[] = [
  { line: '우유라인', product: 'P-MILK', planned: 30000, baseYield: 0.992, minor: ['충진 노즐 세척', '팩 공급 지연', '라벨 교체', 'CIP 세척 대기'] },
  { line: '발효유라인', product: 'P-YOGURT', planned: 24000, baseYield: 0.99, minor: ['배양 탱크 전환 대기', '컵 실링 온도 재설정', '충진량 보정', '포장기 필름 교체'] },
  { line: '소시지라인', product: 'P-SAUSAGE', planned: 15000, baseYield: 0.985, minor: ['케이싱 교체', '스터퍼 호스 점검', '포장기 센서 재설정', '훈연 대기'] },
  { line: '햄라인', product: 'P-HAM', planned: 9000, baseYield: 0.987, minor: ['텀블링 배치 전환', '몰드 세척', '슬라이서 칼날 점검', '진공 포장기 재설정'] },
];
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;

const pRows = ['date,line,product,planned_qty,actual_qty,good_qty,defect_qty,runtime_min,downtime_min,downtime_reason,defect_note'];
for (let day = 1; day <= 30; day++) {
  const date = `2026-06-${String(day).padStart(2, '0')}`;
  if (new Date(`${date}T00:00:00Z`).getUTCDay() === 0) continue; // 일요일 휴무
  for (const l of LINES) {
    let ach = between(0.95, 1.01);
    let y = l.baseYield + between(-0.004, 0.004);
    let down = Math.round(between(15, 45));
    let reason = pick(l.minor);
    let note = '';

    // 균질기 열화(HOM-01) → 우유라인: 6/9~10 불량 증가, 6/11 균질기 고장 정지
    if (l.line === '우유라인' && (day === 9 || day === 10)) {
      y = 0.968 - (day - 9) * 0.004 + between(-0.002, 0.002);
      note = '균질 불량으로 지방 분리 의심 팩 증가';
    }
    if (l.line === '우유라인' && day === 11) {
      down = 340;
      reason = '균질기 밸브 시트 파손으로 긴급 정지, 부품 교체';
      ach = 0.62;
    }
    // 커터 칼날 마모(CUT-01) → 소시지라인: 6/24~26 유화 불량·케이싱 파열
    if (l.line === '소시지라인' && day >= 24 && day <= 26) {
      y = 0.958 - (day - 24) * 0.005 + between(-0.002, 0.002);
      note = '유화 불량 및 케이싱 파열 증가, 커터 칼날 마모 의심';
      down += 20;
    }

    const actual = Math.round(l.planned * ach);
    const good = Math.round(actual * y);
    pRows.push([date, l.line, l.product, l.planned, actual, good, actual - good, 960 - down, down, `"${reason}"`, `"${note}"`].join(','));
  }
}
writeFileSync(`${OUT}production_dairy_meat.csv`, pRows.join('\n') + '\n', 'utf8');
console.log(`production_dairy_meat.csv: ${pRows.length - 1} rows`);

// ───────── 검사 성적 (품질관리: 관리도·공정능력 분석용) ─────────
// 2026-04-01 ~ 06-30 매일 1회, 6개 항목. 앞 30일이 정상 기준선이다.
//  우유 지방률   : 안정 (오탐이 없어야 함)
//  우유 산도     : 6/10부터 평균이 올라감(shift). 규격 이내지만 관리도 이탈 → 조기 경보
//  발효유 pH     : 6/1부터 산포가 2배로 커짐 → 공정능력 저하
//  소시지 염도   : 6/5부터 서서히 상승(trend). 규격 이내지만 이 추세면 상한 도달 예측
//  소시지 수분   : 이탈 없음. 평균이 상한 쪽에 붙어 있어 공정능력(Cpk)이 낮음 (구조적 문제)
//  햄 중량       : 6/20부터 평균이 낮아지고 6/24, 6/27 규격 하한 미달
const INS_START = Date.UTC(2026, 3, 1);
const insDate = (i: number) => new Date(INS_START + i * dayMs).toISOString().slice(0, 10);
const insIdx = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - INS_START) / dayMs);
const INS_DAYS = insIdx('2026-06-30') + 1;

interface InsSeries {
  product: string;
  item: string;
  unit: string;
  lotPrefix: string;
  mean: number;
  sd: number;
  digits: number;
  min?: number;
  max?: number;
  effect?: (i: number) => { shift?: number; sdMul?: number };
}
const rd = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

const INS: InsSeries[] = [
  { product: '우유', item: '지방률', unit: '%', lotPrefix: 'M', mean: 3.6, sd: 0.05, digits: 2, min: 3.3, max: 3.9 },
  { product: '우유', item: '산도', unit: '%', lotPrefix: 'M', mean: 0.15, sd: 0.003, digits: 3, max: 0.18,
    effect: (i) => (i >= insIdx('2026-06-10') ? { shift: 0.008 } : {}) },
  { product: '발효유', item: 'pH', unit: '', lotPrefix: 'Y', mean: 4.4, sd: 0.04, digits: 2, min: 4.1, max: 4.7,
    effect: (i) => (i >= insIdx('2026-06-01') ? { sdMul: 2 } : {}) },
  { product: '소시지', item: '염도', unit: '%', lotPrefix: 'S', mean: 1.9, sd: 0.03, digits: 2, min: 1.6, max: 2.2,
    effect: (i) => (i >= insIdx('2026-06-05') ? { shift: 0.0045 * (i - insIdx('2026-06-05') + 1) } : {}) },
  { product: '소시지', item: '수분', unit: '%', lotPrefix: 'S', mean: 60.4, sd: 0.45, digits: 1, max: 62 },
  { product: '햄', item: '중량', unit: 'g', lotPrefix: 'H', mean: 200, sd: 1.2, digits: 1, min: 195, max: 205,
    effect: (i) => (i >= insIdx('2026-06-20') ? { shift: -2.5 } : {}) },
];
const FORCED: Record<string, Record<string, number>> = { '햄|중량': { '2026-06-24': 194.2, '2026-06-27': 193.8 } };

const iRows = ['date,lot,product,test_item,value,unit,spec_min,spec_max'];
for (let i = 0; i < INS_DAYS; i++) {
  const date = insDate(i);
  const mmdd = date.slice(5).replace('-', '');
  for (const s of INS) {
    const ef = s.effect?.(i) ?? {};
    let v = gauss(s.mean + (ef.shift ?? 0), s.sd * (ef.sdMul ?? 1));
    const forced = FORCED[`${s.product}|${s.item}`]?.[date];
    if (forced !== undefined) v = forced;
    iRows.push([date, `${s.lotPrefix}${mmdd}`, s.product, s.item, rd(v, s.digits), s.unit, s.min ?? '', s.max ?? ''].join(','));
  }
}
writeFileSync(`${OUT}inspection_dairy_meat.csv`, iRows.join('\n') + '\n', 'utf8');
console.log(`inspection_dairy_meat.csv: ${iRows.length - 1} rows`);

// ───────── 위생점검 기록 (품질보증: 반복 지적·기한 초과 분석용) ─────────
// 2026-01 ~ 06, 3개 공장 × 매월 1회 × 점검 항목 10개 = 180행. 기준일(as of)은 마지막 점검일(6/15).
//  평택 '방충망·출입문 밀폐'     : 6회 중 4회 부적합 → 반복 지적
//  음성 '냉장·냉동 온도 기록'    : 3월부터 매달 부적합, 심각도 하→중 → 반복 + 악화
//  안양 '원료 보관 구분(알레르기)': 5월 '상' 미결·기한 초과, 6월 '상' 재발 → 기한 초과 중대 지적
//  세 공장 모두 6월 '포충등 관리 기록' 부적합 → 여러 공장 공통 문제
const HY_ITEMS: Array<[string, string]> = [
  ['작업자 위생복·두건 착용', '작업장 입구'],
  ['손 세척·소독 실시', '작업장 입구'],
  ['방충망·출입문 밀폐', '포장실'],
  ['포충등 관리 기록', '포장실'],
  ['바닥·배수구 청결', '가공실'],
  ['설비 세척 상태', '가공실'],
  ['냉장·냉동 온도 기록', '원료창고'],
  ['원료 보관 구분(알레르기)', '원료창고'],
  ['유리·경질 플라스틱 관리', '포장실'],
  ['세척제·약품 보관', '세척실'],
];
const HY_PLANTS: Array<[string, number]> = [['음성공장', 10], ['안양공장', 12], ['평택공장', 15]];
const HY_DUE_DAYS: Record<string, number> = { 상: 7, 중: 14, 하: 21 };
const hyDate = (m: number, d: number) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * dayMs).toISOString().slice(0, 10);
const AS_OF = '2026-06-15';

// 심어둔 부적합: [공장, 월, 항목, 심각도, 지적 내용, 미결 여부]
const HY_PLANTED: Array<[string, number, string, string, string, boolean]> = [
  ['평택공장', 2, '방충망·출입문 밀폐', '중', '포장실 방충망 하단 찢어짐(약 10cm)', false],
  ['평택공장', 3, '방충망·출입문 밀폐', '중', '포장실 출입문 하부 틈새 5mm', false],
  ['평택공장', 5, '방충망·출입문 밀폐', '중', '포장실 방충망 재파손, 지난 수리 부위 옆', false],
  ['평택공장', 6, '방충망·출입문 밀폐', '중', '포장실 출입문 자동 닫힘 장치 고장', true],
  ['음성공장', 3, '냉장·냉동 온도 기록', '하', '원료창고 냉장고 2호 오후 기록 1회 누락', false],
  ['음성공장', 4, '냉장·냉동 온도 기록', '하', '냉장고 2호 기록 2회 누락', false],
  ['음성공장', 5, '냉장·냉동 온도 기록', '중', '냉동고 1호 주말 기록 공백, 온도 이탈 확인 불가', false],
  ['음성공장', 6, '냉장·냉동 온도 기록', '중', '냉장고 2호 기록지 미비치, 3일치 누락', true],
  ['안양공장', 5, '원료 보관 구분(알레르기)', '상', '참깨 원료가 일반 원료 선반에 혼재 보관', true],
  ['안양공장', 6, '원료 보관 구분(알레르기)', '상', '땅콩 분말 표시 없이 공용 용기에 보관', true],
  ['음성공장', 6, '포충등 관리 기록', '하', '포충등 포획지 교체 기록 누락', true],
  ['안양공장', 6, '포충등 관리 기록', '하', '포충등 1대 전원 꺼짐, 기록 없음', true],
  ['평택공장', 6, '포충등 관리 기록', '하', '포충등 포획 수 기록 2주 공백', true],
];
const HY_RANDOM_FINDINGS: Record<string, string> = {
  '작업자 위생복·두건 착용': '두건 밖으로 머리카락 노출 1명',
  '손 세척·소독 실시': '손 소독기 소독액 소진',
  '바닥·배수구 청결': '배수구 트랩 이물 적치',
  '설비 세척 상태': '컨베이어 하부 잔여물',
  '유리·경질 플라스틱 관리': '경질 플라스틱 점검표 미기록',
  '세척제·약품 보관': '세척제 용기 표시 훼손',
};

const hRows = ['date,plant,area,item,result,severity,finding,due_date,closed_date'];
for (let m = 1; m <= 6; m++) {
  for (const [plant, day] of HY_PLANTS) {
    const date = hyDate(m, day);
    for (const [item, area] of HY_ITEMS) {
      const planted = HY_PLANTED.find((p) => p[0] === plant && p[1] === m && p[2] === item);
      let nc = false;
      let sev = '';
      let finding = '';
      let open = false;
      if (planted) {
        [, , , sev, finding, open] = planted;
        nc = true;
      } else if (HY_RANDOM_FINDINGS[item] && rand() < 0.05) {
        nc = true;
        sev = rand() < 0.75 ? '하' : '중';
        finding = HY_RANDOM_FINDINGS[item]!;
      }
      if (!nc) {
        hRows.push([date, plant, area, item, '적합', '', '', '', ''].join(','));
        continue;
      }
      const due = addDays(date, HY_DUE_DAYS[sev]!);
      // 미결이 아니면 대부분 기한 안에 닫힘, 일부는 늦게 닫힘
      let closed = '';
      if (!open) {
        const late = rand() < 0.25;
        closed = addDays(due, late ? 3 + Math.floor(rand() * 6) : -Math.floor(rand() * 5));
        if (closed > AS_OF) closed = ''; // 기준일 이후 날짜는 아직 안 닫힌 것으로
      }
      hRows.push([date, plant, area, item, '부적합', sev, `"${finding}"`, due, closed].join(','));
    }
  }
}
writeFileSync(`${OUT}hygiene_audits.csv`, hRows.join('\n') + '\n', 'utf8');
console.log(`hygiene_audits.csv: ${hRows.length - 1} rows`);
