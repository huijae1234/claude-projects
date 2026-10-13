import { CsvFormatError, assertColumns, splitCsvLine } from './seed';

export const EQUIPMENT_REQUIRED_COLUMNS = [
  'date', 'machine_id', 'machine_name', 'load_pct', 'motor_temp_c', 'bearing_temp_c',
  'vibration_mms', 'motor_current_a', 'downtime_min', 'breakdown_flag',
] as const;

/** 값이 있으면 추세를 분석하는 센서 지표 (공정 압력·온도는 설비에 따라 없을 수 있다). */
export const SENSOR_METRICS = [
  'motor_temp_c', 'bearing_temp_c', 'vibration_mms', 'motor_current_a', 'process_pressure_bar', 'process_temp_c',
] as const;
export type SensorMetric = (typeof SENSOR_METRICS)[number];

export interface EquipmentRow {
  date: string;
  machine_id: string;
  machine_name: string;
  area: string;
  downtime_min: number;
  breakdown: boolean;
  wo_type: string;
  note: string;
  wear_index: number | null;
  values: Partial<Record<SensorMetric, number>>;
}

export const MAX_EQUIPMENT_ROWS = 300_000;

export function parseEquipmentCsv(csv: string): EquipmentRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? '');
  assertColumns(header, EQUIPMENT_REQUIRED_COLUMNS, '설비 데이터');
  if (lines.length - 1 > MAX_EQUIPMENT_ROWS) {
    throw new CsvFormatError(`행이 너무 많습니다(${lines.length - 1}행). ${MAX_EQUIPMENT_ROWS}행 이하로 줄여 주세요.`);
  }
  const col = new Map(header.map((h, i) => [h, i]));
  const text = (cells: string[], name: string) => (col.has(name) ? (cells[col.get(name)!] ?? '').trim() : '');
  const num = (cells: string[], name: string): number | null => {
    const v = text(cells, name);
    if (v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const rows: EquipmentRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!);
    if (cells.length < 2) continue;
    const date = text(cells, 'date');
    if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
      throw new CsvFormatError(`${i + 1}번째 줄의 date 형식이 올바르지 않습니다: "${date}" (YYYY-MM-DD 형식이어야 합니다)`);
    }
    const values: EquipmentRow['values'] = {};
    for (const m of SENSOR_METRICS) {
      const v = num(cells, m);
      if (v !== null) values[m] = v;
    }
    rows.push({
      date: date.slice(0, 10),
      machine_id: text(cells, 'machine_id'),
      machine_name: text(cells, 'machine_name'),
      area: text(cells, 'area'),
      downtime_min: num(cells, 'downtime_min') ?? 0,
      breakdown: num(cells, 'breakdown_flag') === 1,
      wo_type: text(cells, 'wo_type'),
      note: text(cells, 'note'),
      wear_index: num(cells, 'wear_index'),
      values,
    });
  }
  return rows;
}

// ───────────── 분석 (숫자 계산은 코드가 한다) ─────────────

export interface MetricFlag {
  metric: SensorMetric;
  baseline_mean: number;
  window_mean: number;
  /** (구간 평균 - 기준 평균) / 기준 표준편차 */
  z: number;
  pct_change: number;
  /** 구간 표준편차 / 기준 표준편차. 평균은 같아도 흔들림이 커지면 커진다. */
  spread_ratio: number;
  kind: 'drift' | 'unstable';
}

export interface BreakdownEvent {
  date: string;
  downtime_min: number;
  note: string;
  /** 고장 직전 구간에서 기준선과 달라지고 있던 지표 (조기 경보 근거) */
  precursors: MetricFlag[];
}

export type Risk = 'high' | 'medium' | 'low';

export interface MachineAnalysis {
  machine_id: string;
  machine_name: string;
  area: string;
  days: number;
  period: [string, string];
  baseline_days: number;
  window_days: number;
  risk: Risk;
  risk_reasons: string[];
  current_flags: MetricFlag[];
  wear_index_latest: number | null;
  breakdowns: BreakdownEvent[];
  total_downtime_min: number;
}

export interface EquipmentAnalysis {
  machines: MachineAnalysis[];
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

const Z_DRIFT = 3;
const Z_STRONG = 6;
const SPREAD_UNSTABLE = 2.5;

function flagMetrics(baseline: EquipmentRow[], window: EquipmentRow[]): MetricFlag[] {
  const flags: MetricFlag[] = [];
  for (const metric of SENSOR_METRICS) {
    const b = baseline.map((r) => r.values[metric]).filter((v): v is number => v !== undefined);
    const w = window.map((r) => r.values[metric]).filter((v): v is number => v !== undefined);
    if (b.length < 10 || w.length < 5) continue;
    const bMean = mean(b);
    const bStd = Math.max(std(b), Math.abs(bMean) * 0.005, 1e-6); // 0에 가까운 표준편차 방지
    const wMean = mean(w);
    const z = (wMean - bMean) / bStd;
    const spread = std(w) / bStd;
    const drift = Math.abs(z) >= Z_DRIFT;
    const unstable = !drift && spread >= SPREAD_UNSTABLE;
    if (!drift && !unstable) continue;
    flags.push({
      metric,
      baseline_mean: round(bMean),
      window_mean: round(wMean),
      z: round(z, 1),
      pct_change: round(((wMean - bMean) / (Math.abs(bMean) || 1)) * 100, 1),
      spread_ratio: round(spread, 1),
      kind: drift ? 'drift' : 'unstable',
    });
  }
  return flags;
}

export function analyzeEquipment(
  rows: EquipmentRow[],
  opts: { baselineDays?: number; windowDays?: number } = {},
): EquipmentAnalysis {
  const baselineDays = opts.baselineDays ?? 30;
  const windowDays = opts.windowDays ?? 14;

  const byMachine = new Map<string, EquipmentRow[]>();
  for (const r of rows) byMachine.set(r.machine_id, [...(byMachine.get(r.machine_id) ?? []), r]);

  const machines: MachineAnalysis[] = [];
  for (const [id, all] of byMachine) {
    const rs = [...all].sort((a, b) => a.date.localeCompare(b.date));
    // 기준선: 처음 N일 중 고장·정비가 없는 정상 가동일
    const baseline = rs.filter((r) => !r.breakdown && r.wo_type === '').slice(0, baselineDays);
    const recent = rs.slice(-windowDays);

    const breakdowns: BreakdownEvent[] = rs
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => r.breakdown)
      .map(({ r, idx }) => ({
        date: r.date,
        downtime_min: r.downtime_min,
        note: r.note,
        precursors: flagMetrics(baseline, rs.slice(Math.max(0, idx - windowDays), idx)),
      }));

    const current = baseline.length >= 10 ? flagMetrics(baseline, recent) : [];
    const strong = current.filter((f) => f.kind === 'drift' && Math.abs(f.z) >= Z_STRONG);
    const reasons: string[] = current.map(
      (f) =>
        f.kind === 'drift'
          ? `${f.metric} 평균이 기준 대비 ${f.pct_change > 0 ? '+' : ''}${f.pct_change}% (z=${f.z})`
          : `${f.metric} 변동폭이 기준의 ${f.spread_ratio}배`,
    );

    const wearLatest = [...rs].reverse().find((r) => r.wear_index !== null)?.wear_index ?? null;
    let risk: Risk = 'low';
    if (strong.length >= 2) risk = 'high';
    else if (current.length >= 1) risk = 'medium';
    if (wearLatest !== null && wearLatest >= 80) {
      risk = 'high';
      reasons.push(`wear_index ${wearLatest} (교체 임박)`);
    } else if (wearLatest !== null && wearLatest >= 65 && risk === 'low') {
      risk = 'medium';
      reasons.push(`wear_index ${wearLatest} (교체 준비)`);
    }

    machines.push({
      machine_id: id,
      machine_name: rs[0]!.machine_name,
      area: rs[0]!.area,
      days: rs.length,
      period: [rs[0]!.date, rs[rs.length - 1]!.date],
      baseline_days: baseline.length,
      window_days: recent.length,
      risk,
      risk_reasons: reasons,
      current_flags: current,
      wear_index_latest: wearLatest,
      breakdowns,
      total_downtime_min: rs.reduce((a, r) => a + r.downtime_min, 0),
    });
  }

  const order: Record<Risk, number> = { high: 0, medium: 1, low: 2 };
  machines.sort((a, b) => order[a.risk] - order[b.risk] || a.machine_id.localeCompare(b.machine_id));
  return { machines };
}
