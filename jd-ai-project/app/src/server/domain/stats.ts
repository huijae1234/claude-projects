import type { ProductionRow } from './seed';

export interface LineStats {
  line: string;
  product: string;
  days: number;
  avg_yield_pct: number;
  avg_achievement_pct: number;
  total_downtime_min: number;
  availability_pct: number;
}

export interface FlaggedRow {
  line: string;
  date: string;
  reasons: Array<'yield_drop' | 'long_downtime' | 'low_achievement'>;
  yield_pct: number;
  line_median_yield_pct: number;
  achievement_pct: number;
  downtime_min: number;
  downtime_reason: string;
  defect_note: string;
}

export interface ProductionStats {
  perLine: LineStats[];
  flagged: FlaggedRow[];
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const pct = (n: number) => round(n * 100);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** 숫자 계산과 이상치 탐지는 코드가 한다. AI는 이 결과를 해석만 한다. */
export function analyzeProduction(rows: ProductionRow[]): ProductionStats {
  const byLine = new Map<string, ProductionRow[]>();
  for (const r of rows) byLine.set(r.line, [...(byLine.get(r.line) ?? []), r]);

  const perLine: LineStats[] = [];
  const flagged: FlaggedRow[] = [];

  for (const [line, rs] of byLine) {
    const yields = rs.map((r) => r.good_qty / r.actual_qty);
    const medYield = median(yields);
    const medDown = median(rs.map((r) => r.downtime_min));
    const totalDown = rs.reduce((a, r) => a + r.downtime_min, 0);
    const totalRun = rs.reduce((a, r) => a + r.runtime_min + r.downtime_min, 0);

    perLine.push({
      line,
      product: rs[0]!.product,
      days: rs.length,
      avg_yield_pct: pct(yields.reduce((a, b) => a + b, 0) / yields.length),
      avg_achievement_pct: pct(rs.reduce((a, r) => a + r.actual_qty / r.planned_qty, 0) / rs.length),
      total_downtime_min: totalDown,
      availability_pct: pct(1 - totalDown / totalRun),
    });

    for (const r of rs) {
      const y = r.good_qty / r.actual_qty;
      const ach = r.actual_qty / r.planned_qty;
      const reasons: FlaggedRow['reasons'] = [];
      if (y < medYield - 0.015) reasons.push('yield_drop');
      if (r.downtime_min > 120 && r.downtime_min > medDown * 3) reasons.push('long_downtime');
      if (ach < 0.85) reasons.push('low_achievement');
      if (reasons.length === 0) continue;
      flagged.push({
        line,
        date: r.date,
        reasons,
        yield_pct: pct(y),
        line_median_yield_pct: pct(medYield),
        achievement_pct: pct(ach),
        downtime_min: r.downtime_min,
        downtime_reason: r.downtime_reason,
        defect_note: r.defect_note,
      });
    }
  }

  flagged.sort((a, b) => a.date.localeCompare(b.date) || a.line.localeCompare(b.line));
  return { perLine, flagged };
}
