import { CsvFormatError, assertColumns, splitCsvLine } from './seed';

export const HYGIENE_REQUIRED_COLUMNS = ['date', 'plant', 'area', 'item', 'result'] as const;
export const MAX_HYGIENE_ROWS = 50_000;

export type Severity = '상' | '중' | '하';
const SEV_RANK: Record<Severity, number> = { 하: 1, 중: 2, 상: 3 };

export interface HygieneRow {
  date: string;
  plant: string;
  area: string;
  item: string;
  nonconforming: boolean;
  severity: Severity | null;
  finding: string;
  due_date: string | null;
  closed_date: string | null;
}

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export function parseHygieneCsv(csv: string): HygieneRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? '');
  assertColumns(header, HYGIENE_REQUIRED_COLUMNS, '위생점검 기록');
  if (lines.length - 1 > MAX_HYGIENE_ROWS) {
    throw new CsvFormatError(`행이 너무 많습니다(${lines.length - 1}행). ${MAX_HYGIENE_ROWS}행 이하로 줄여 주세요.`);
  }
  const col = new Map(header.map((h, i) => [h, i]));
  const get = (cells: string[], name: string) => (col.has(name) ? (cells[col.get(name)!] ?? '').trim() : '');

  const rows: HygieneRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!);
    if (cells.length < 2) continue;
    const date = get(cells, 'date').slice(0, 10);
    if (!isDate(date)) throw new CsvFormatError(`${i + 1}번째 줄의 date 형식이 올바르지 않습니다: "${get(cells, 'date')}"`);
    const result = get(cells, 'result');
    if (result !== '적합' && result !== '부적합') {
      throw new CsvFormatError(`${i + 1}번째 줄의 result는 "적합" 또는 "부적합"이어야 합니다: "${result}"`);
    }
    const sev = get(cells, 'severity');
    const due = get(cells, 'due_date');
    const closed = get(cells, 'closed_date');
    rows.push({
      date,
      plant: get(cells, 'plant'),
      area: get(cells, 'area'),
      item: get(cells, 'item'),
      nonconforming: result === '부적합',
      severity: sev === '상' || sev === '중' || sev === '하' ? sev : null,
      finding: get(cells, 'finding'),
      due_date: isDate(due) ? due : null,
      closed_date: isDate(closed) ? closed : null,
    });
  }
  return rows;
}

// ───────────── 분석 (집계·판정은 코드가 한다) ─────────────

export type Risk = 'high' | 'medium' | 'low';

export interface PlantSummary {
  plant: string;
  audits: number;
  checks: number;
  nonconformities: number;
  nc_rate_pct: number;
  /** 월별 점검 수·부적합 수 (추이) */
  monthly: Array<{ month: string; checks: number; nc: number }>;
  open: number;
  overdue: number;
  closed_late: number;
  avg_days_to_close: number | null;
  risk: Risk;
  risk_reasons: string[];
}

export interface RecurringFinding {
  plant: string;
  area: string;
  item: string;
  /** 최근 점검들 중 부적합이 나온 횟수 / 본 점검 횟수 */
  count: number;
  of_audits: number;
  months: string[];
  latest_severity: Severity | null;
  worsening: boolean;
  latest_finding: string;
}

export interface SystemicItem {
  item: string;
  plants: string[];
  months: string[];
}

export interface OverdueItem {
  plant: string;
  area: string;
  item: string;
  severity: Severity | null;
  audit_date: string;
  due_date: string;
  days_overdue: number;
  finding: string;
}

export interface HygieneAnalysis {
  as_of: string;
  checklist: string[];
  plants: PlantSummary[];
  recurring: RecurringFinding[];
  systemic: SystemicItem[];
  overdue: OverdueItem[];
}

const RECENT_AUDITS = 6;
const RECURRING_MIN = 3;
const SYSTEMIC_MONTHS = 2;
const SYSTEMIC_MIN_PLANTS = 2;

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function analyzeHygiene(rows: HygieneRow[], opts: { asOf?: string } = {}): HygieneAnalysis {
  if (rows.length === 0) return { as_of: opts.asOf ?? '', checklist: [], plants: [], recurring: [], systemic: [], overdue: [] };
  const asOf = opts.asOf ?? rows.reduce((m, r) => (r.date > m ? r.date : m), rows[0]!.date);
  const checklist = [...new Set(rows.map((r) => r.item))];
  const plants = [...new Set(rows.map((r) => r.plant))].sort();

  // 기한 초과: 부적합인데 아직 안 닫혔고 기한이 기준일보다 앞선 것
  const overdue: OverdueItem[] = rows
    .filter((r) => r.nonconforming && !r.closed_date && r.due_date && r.due_date < asOf)
    .map((r) => ({
      plant: r.plant, area: r.area, item: r.item, severity: r.severity, audit_date: r.date,
      due_date: r.due_date!, days_overdue: daysBetween(r.due_date!, asOf), finding: r.finding,
    }))
    .sort((a, b) => (SEV_RANK[b.severity ?? '하'] - SEV_RANK[a.severity ?? '하']) || b.days_overdue - a.days_overdue);

  // 반복 지적: 공장의 최근 6회 점검 중 같은 항목이 3회 이상 부적합
  const recurring: RecurringFinding[] = [];
  for (const plant of plants) {
    const auditDates = [...new Set(rows.filter((r) => r.plant === plant).map((r) => r.date))].sort().slice(-RECENT_AUDITS);
    const recent = rows.filter((r) => r.plant === plant && auditDates.includes(r.date));
    for (const item of checklist) {
      const ncs = recent.filter((r) => r.item === item && r.nonconforming).sort((a, b) => a.date.localeCompare(b.date));
      if (ncs.length < RECURRING_MIN) continue;
      const first = ncs[0]!;
      const last = ncs[ncs.length - 1]!;
      recurring.push({
        plant, area: last.area, item, count: ncs.length, of_audits: auditDates.length,
        months: ncs.map((r) => r.date.slice(0, 7)),
        latest_severity: last.severity,
        worsening: SEV_RANK[last.severity ?? '하'] > SEV_RANK[first.severity ?? '하'],
        latest_finding: last.finding,
      });
    }
  }
  recurring.sort((a, b) => b.count - a.count || Number(b.worsening) - Number(a.worsening));

  // 여러 공장 공통 문제: 최근 2개월 안에 같은 항목이 2개 이상 공장에서 부적합
  const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort().slice(-SYSTEMIC_MONTHS);
  const systemic: SystemicItem[] = checklist
    .map((item) => {
      const hits = rows.filter((r) => r.item === item && r.nonconforming && months.includes(r.date.slice(0, 7)));
      return { item, plants: [...new Set(hits.map((r) => r.plant))].sort(), months: [...new Set(hits.map((r) => r.date.slice(0, 7)))].sort() };
    })
    .filter((s) => s.plants.length >= SYSTEMIC_MIN_PLANTS)
    .sort((a, b) => b.plants.length - a.plants.length);

  const summaries: PlantSummary[] = plants.map((plant) => {
    const pr = rows.filter((r) => r.plant === plant);
    const nc = pr.filter((r) => r.nonconforming);
    const closed = nc.filter((r) => r.closed_date);
    const byMonth = new Map<string, { checks: number; nc: number }>();
    for (const r of pr) {
      const m = r.date.slice(0, 7);
      const cur = byMonth.get(m) ?? { checks: 0, nc: 0 };
      cur.checks += 1;
      if (r.nonconforming) cur.nc += 1;
      byMonth.set(m, cur);
    }
    const myOverdue = overdue.filter((o) => o.plant === plant);
    const myRecurring = recurring.filter((x) => x.plant === plant);
    const reasons: string[] = [];
    for (const o of myOverdue) reasons.push(`기한 초과 ${o.days_overdue}일: ${o.item} (심각도 ${o.severity ?? '-'})`);
    for (const x of myRecurring) reasons.push(`반복 지적: ${x.item} 최근 ${x.of_audits}회 중 ${x.count}회${x.worsening ? ', 심각도 악화' : ''}`);

    let risk: Risk = 'low';
    // 높음: 중대(상) 기한 초과, 반복되며 심각해지는 지적, 5회 이상 반복 / 주의: 그 밖의 반복·기한 초과
    if (myOverdue.some((o) => o.severity === '상') || myRecurring.some((x) => x.count >= 5 || (x.worsening && x.latest_severity !== '하'))) risk = 'high';
    else if (myOverdue.length > 0 || myRecurring.length > 0) risk = 'medium';

    return {
      plant,
      audits: new Set(pr.map((r) => r.date)).size,
      checks: pr.length,
      nonconformities: nc.length,
      nc_rate_pct: round1((nc.length / pr.length) * 100),
      monthly: [...byMonth].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v })),
      open: nc.filter((r) => !r.closed_date).length,
      overdue: myOverdue.length,
      closed_late: closed.filter((r) => r.due_date && r.closed_date! > r.due_date).length,
      avg_days_to_close: closed.length ? round1(closed.reduce((a, r) => a + daysBetween(r.date, r.closed_date!), 0) / closed.length) : null,
      risk,
      risk_reasons: reasons,
    };
  });
  const order: Record<Risk, number> = { high: 0, medium: 1, low: 2 };
  summaries.sort((a, b) => order[a.risk] - order[b.risk] || a.plant.localeCompare(b.plant));

  return { as_of: asOf, checklist, plants: summaries, recurring, systemic, overdue };
}
