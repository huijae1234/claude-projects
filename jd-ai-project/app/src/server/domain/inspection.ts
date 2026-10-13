import { CsvFormatError, assertColumns, splitCsvLine } from './seed';

export const INSPECTION_REQUIRED_COLUMNS = ['date', 'product', 'test_item', 'value'] as const;
export const MAX_INSPECTION_ROWS = 100_000;

export interface InspectionRow {
  date: string;
  lot: string;
  product: string;
  test_item: string;
  unit: string;
  value: number;
  spec_min: number | null;
  spec_max: number | null;
}

export function parseInspectionCsv(csv: string): InspectionRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? '');
  assertColumns(header, INSPECTION_REQUIRED_COLUMNS, '검사 성적');
  if (lines.length - 1 > MAX_INSPECTION_ROWS) {
    throw new CsvFormatError(`행이 너무 많습니다(${lines.length - 1}행). ${MAX_INSPECTION_ROWS}행 이하로 줄여 주세요.`);
  }
  const col = new Map(header.map((h, i) => [h, i]));
  const text = (cells: string[], name: string) => (col.has(name) ? (cells[col.get(name)!] ?? '').trim() : '');
  const num = (cells: string[], name: string): number | null => {
    const v = text(cells, name);
    if (v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const rows: InspectionRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!);
    if (cells.length < 2) continue;
    const date = text(cells, 'date');
    if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
      throw new CsvFormatError(`${i + 1}번째 줄의 date 형식이 올바르지 않습니다: "${date}" (YYYY-MM-DD 형식이어야 합니다)`);
    }
    const value = num(cells, 'value');
    if (value === null) {
      throw new CsvFormatError(`${i + 1}번째 줄의 value가 숫자가 아닙니다: "${text(cells, 'value')}"`);
    }
    rows.push({
      date: date.slice(0, 10),
      lot: text(cells, 'lot'),
      product: text(cells, 'product'),
      test_item: text(cells, 'test_item'),
      unit: text(cells, 'unit'),
      value,
      spec_min: num(cells, 'spec_min'),
      spec_max: num(cells, 'spec_max'),
    });
  }
  return rows;
}

// ───────────── 분석 (숫자 계산은 코드가 한다) ─────────────

export type RuleId = 'oos' | 'beyond_3sigma' | 'shift' | 'trend' | 'spread' | 'capability';
export type Risk = 'high' | 'medium' | 'low';

export interface Violation {
  rule: RuleId;
  from: string;
  to: string;
  count: number;
  detail: string;
  /** 최근 14개 측정 안에 걸리는가 (현재 진행 중인 문제인가) */
  recent: boolean;
}

export interface SeriesPoint {
  date: string;
  value: number;
  flags: RuleId[];
}

export interface TrendInfo {
  slope_per_day: number;
  t: number;
  /** 이 추세가 이어질 때 규격 한계에 닿기까지 남은 일수 (이미 벗어났거나 한계 쪽이 아니면 null) */
  days_to_limit: number | null;
  limit: 'upper' | 'lower' | null;
}

export interface SeriesAnalysis {
  key: string;
  product: string;
  test_item: string;
  unit: string;
  n: number;
  period: [string, string];
  spec_min: number | null;
  spec_max: number | null;
  baseline: { n: number; mean: number; sd: number; ucl: number; lcl: number };
  recent: { n: number; mean: number; sd: number };
  cpk_all: number | null;
  cpk_recent: number | null;
  trend: TrendInfo | null;
  violations: Violation[];
  risk: Risk;
  risk_reasons: string[];
  points: SeriesPoint[];
}

export interface InspectionAnalysis {
  series: SeriesAnalysis[];
}

const RECENT_N = 14;
const BASELINE_MAX = 30;
const MIN_POINTS = 20;
const SHIFT_RUN = 8;
const TREND_WINDOW = 21;
const SPREAD_RATIO = 1.8;
const CPK_OK = 1.33;
const CPK_BAD = 1.0;

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000;

/** 규격 한계가 있는 쪽 기준 Cpk. 한쪽 규격만 있으면 그쪽만 본다. */
function cpk(values: number[], lo: number | null, hi: number | null): number | null {
  if (lo === null && hi === null) return null;
  if (values.length < 5) return null;
  const m = mean(values);
  const s = Math.max(sd(values), 1e-9);
  const parts: number[] = [];
  if (hi !== null) parts.push((hi - m) / (3 * s));
  if (lo !== null) parts.push((m - lo) / (3 * s));
  return round(Math.min(...parts), 2);
}

/** 연속된 인덱스를 [시작, 끝] 구간으로 묶는다. */
function runs(idx: number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const i of idx) {
    const last = out[out.length - 1];
    if (last && i === last[1] + 1) last[1] = i;
    else out.push([i, i]);
  }
  return out;
}

function analyzeSeries(key: string, rows: InspectionRow[]): SeriesAnalysis {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const values = sorted.map((r) => r.value);
  const n = values.length;
  const specMin = [...sorted].reverse().find((r) => r.spec_min !== null)?.spec_min ?? null;
  const specMax = [...sorted].reverse().find((r) => r.spec_max !== null)?.spec_max ?? null;

  const bN = Math.min(BASELINE_MAX, Math.floor(n / 2));
  const base = values.slice(0, bN);
  const center = base.length ? mean(base) : 0;
  const sigma = Math.max(sd(base), Math.abs(center) * 0.002, 1e-9);
  const ucl = center + 3 * sigma;
  const lcl = center - 3 * sigma;
  const recentVals = values.slice(-RECENT_N);

  const points: SeriesPoint[] = sorted.map((r) => ({ date: r.date, value: r.value, flags: [] }));
  const violations: Violation[] = [];
  const isRecent = (endIdx: number) => endIdx >= n - RECENT_N;
  const add = (rule: RuleId, from: number, to: number, detail: string) =>
    violations.push({ rule, from: sorted[from]!.date, to: sorted[to]!.date, count: to - from + 1, detail, recent: isRecent(to) });

  const analysis: SeriesAnalysis = {
    key,
    product: sorted[0]!.product,
    test_item: sorted[0]!.test_item,
    unit: sorted[0]!.unit,
    n,
    period: [sorted[0]!.date, sorted[n - 1]!.date],
    spec_min: specMin,
    spec_max: specMax,
    baseline: { n: bN, mean: round(center), sd: round(sigma), ucl: round(ucl), lcl: round(lcl) },
    recent: { n: recentVals.length, mean: round(mean(recentVals)), sd: round(sd(recentVals)) },
    cpk_all: cpk(values, specMin, specMax),
    cpk_recent: cpk(values.slice(-30), specMin, specMax),
    trend: null,
    violations,
    risk: 'low',
    risk_reasons: [],
    points,
  };
  if (n < MIN_POINTS) {
    analysis.risk_reasons = [`측정값이 ${n}개뿐이라 분석하지 않았습니다 (최소 ${MIN_POINTS}개)`];
    return analysis;
  }

  // 1) 규격 이탈
  const oos = values.map((v, i) => ((specMax !== null && v > specMax) || (specMin !== null && v < specMin) ? i : -1)).filter((i) => i >= 0);
  for (const i of oos) points[i]!.flags.push('oos');
  for (const [a, b] of runs(oos)) {
    const worst = values.slice(a, b + 1).reduce((w, v) => (Math.abs(v - center) > Math.abs(w - center) ? v : w));
    add('oos', a, b, `규격 이탈 ${b - a + 1}건 (최악값 ${worst}, 규격 ${specMin ?? '-'}~${specMax ?? '-'})`);
  }

  // 2) 관리한계(±3σ) 이탈 — 기준선 이후만 본다
  const beyond = values.map((v, i) => (i >= bN && (v > ucl || v < lcl) ? i : -1)).filter((i) => i >= 0);
  for (const i of beyond) points[i]!.flags.push('beyond_3sigma');
  for (const [a, b] of runs(beyond)) add('beyond_3sigma', a, b, `관리한계(±3σ) 밖 ${b - a + 1}건`);

  // 3) 평균 이동(shift): 같은 쪽에 연속 8개 이상
  let runStart = 0;
  for (let i = 1; i <= n; i++) {
    const sameSide = i < n && Math.sign(values[i]! - center) === Math.sign(values[runStart]! - center) && values[i] !== center;
    if (sameSide) continue;
    if (i - runStart >= SHIFT_RUN && values[runStart] !== center) {
      const above = values[runStart]! > center;
      for (let k = runStart; k < i; k++) points[k]!.flags.push('shift');
      add('shift', runStart, i - 1, `중심선 ${above ? '위' : '아래'}에 ${i - runStart}개 연속 (평균이 ${above ? '올라' : '내려'}감)`);
    }
    runStart = i;
  }

  // 4) 추세: 최근 21개 회귀
  if (n >= TREND_WINDOW) {
    const w = sorted.slice(-TREND_WINDOW);
    const xs = w.map((r) => dayNum(r.date));
    const ys = w.map((r) => r.value);
    const mx = mean(xs);
    const my = mean(ys);
    const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
    const slope = sxx > 0 ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0) / sxx : 0;
    const resid = ys.map((y, i) => y - (my + slope * (xs[i]! - mx)));
    const se = Math.sqrt(resid.reduce((a, r) => a + r * r, 0) / (w.length - 2) / Math.max(sxx, 1e-12));
    const t = se > 0 ? slope / se : 0;
    const fittedLast = my + slope * (xs[xs.length - 1]! - mx);
    const span = xs[xs.length - 1]! - xs[0]!;
    const practical = Math.abs(slope * span) >= sigma; // 구간 동안 1σ 이상 움직여야 의미 있는 추세
    let limit: TrendInfo['limit'] = null;
    let days: number | null = null;
    if (slope > 0 && specMax !== null && fittedLast < specMax) {
      limit = 'upper';
      days = (specMax - fittedLast) / slope;
    } else if (slope < 0 && specMin !== null && fittedLast > specMin) {
      limit = 'lower';
      days = (fittedLast - specMin) / -slope;
    }
    analysis.trend = { slope_per_day: round(slope, 5), t: round(t, 1), days_to_limit: days === null ? null : Math.round(days), limit };
    if (Math.abs(t) >= 3 && practical) {
      const eta = days !== null ? ` 이 추세면 약 ${Math.round(days)}일 뒤 규격 ${limit === 'upper' ? '상한' : '하한'}에 닿습니다.` : '';
      add('trend', n - TREND_WINDOW, n - 1, `최근 ${TREND_WINDOW}개가 하루 ${slope > 0 ? '+' : ''}${round(slope, 4)}씩 ${slope > 0 ? '상승' : '하락'} (t=${round(t, 1)}).${eta}`);
    }
  }

  // 5) 산포 증가: 최근 14개 표준편차가 기준선의 1.8배 이상
  const ratio = sd(recentVals) / sigma;
  if (recentVals.length >= RECENT_N && ratio >= SPREAD_RATIO) {
    add('spread', n - RECENT_N, n - 1, `최근 ${RECENT_N}개의 산포가 기준선의 ${round(ratio, 1)}배`);
  }

  // 6) 공정능력
  if (analysis.cpk_recent !== null && analysis.cpk_recent < CPK_OK) {
    add('capability', Math.max(0, n - 30), n - 1, `최근 30개 Cpk ${analysis.cpk_recent} (${analysis.cpk_recent < CPK_BAD ? '부족' : '보통, 목표 1.33 이상'})`);
  }

  // 위험도
  const recentV = violations.filter((v) => v.recent);
  const hasRecentOos = recentV.some((v) => v.rule === 'oos');
  const badCpk = analysis.cpk_recent !== null && analysis.cpk_recent < CPK_BAD;
  if (hasRecentOos || badCpk) analysis.risk = 'high';
  else if (recentV.length > 0) analysis.risk = 'medium';
  analysis.risk_reasons = recentV.map((v) => v.detail);
  return analysis;
}

export function analyzeInspection(rows: InspectionRow[]): InspectionAnalysis {
  const groups = new Map<string, InspectionRow[]>();
  for (const r of rows) {
    const key = `${r.product}|${r.test_item}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const series = [...groups].map(([k, rs]) => analyzeSeries(k, rs));
  const order: Record<Risk, number> = { high: 0, medium: 1, low: 2 };
  series.sort((a, b) => order[a.risk] - order[b.risk] || a.key.localeCompare(b.key));
  return { series };
}
