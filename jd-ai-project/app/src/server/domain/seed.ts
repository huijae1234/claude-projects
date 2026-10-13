import { z } from 'zod';

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  ingredients: z.array(z.string()).min(1),
  allergens: z.array(z.string()),
  process: z.array(z.string()).min(1),
  specs: z.record(z.string(), z.union([z.number(), z.array(z.number())])),
  lines: z.array(z.string()),
});
export type Product = z.infer<typeof ProductSchema>;

export const RegulationSchema = z.object({
  id: z.string(),
  title: z.string(),
  notice: z.string(),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  articles: z.array(z.object({ no: z.string(), text: z.string() })).min(1),
});
export type Regulation = z.infer<typeof RegulationSchema>;

export const ClaimSchema = z.object({
  id: z.string(),
  /** 목록에 보여줄 짧은 제목. 예: "라면 내 2cm 은색 이물질" */
  title: z.string().optional(),
  channel: z.string(),
  received_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  product_id: z.string(),
  lot: z.string(),
  text: z.string().min(1),
});
export type Claim = z.infer<typeof ClaimSchema>;

/** 부적합 보고서 초안용 현장 메모 샘플. 짧고 불완전하게 쓰는 것이 일반적이다. */
export const NcrMemoSchema = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string().min(1),
});
export type NcrMemo = z.infer<typeof NcrMemoSchema>;

/** 협력업체. history는 과거 품질 이슈 이력이며, 공문 초안이 인용할 수 있는 유일한 과거 사례 출처다. */
export const SupplierSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  supplies: z.array(z.string()).min(1),
  contact_role: z.string(),
  grade: z.enum(['A', 'B', 'C']),
  last_audit: z.string(),
  note: z.string().optional(),
  history: z.array(
    z.object({ id: z.string(), date: z.string(), summary: z.string(), status: z.enum(['open', 'closed']) }),
  ),
});
export type Supplier = z.infer<typeof SupplierSchema>;

/** 협력업체에 알릴 상황 메모 샘플. 현장 메모처럼 짧고 불완전하다. */
export const SupplierCaseSchema = z.object({
  id: z.string(),
  supplier_id: z.string(),
  title: z.string(),
  text: z.string().min(1),
});
export type SupplierCase = z.infer<typeof SupplierCaseSchema>;

export const ProductionRowSchema = z.object({
  date: z.string(),
  line: z.string(),
  product: z.string(),
  planned_qty: z.number(),
  actual_qty: z.number(),
  good_qty: z.number(),
  defect_qty: z.number(),
  runtime_min: z.number(),
  downtime_min: z.number(),
  downtime_reason: z.string().default(''),
  defect_note: z.string().default(''),
});
export type ProductionRow = z.infer<typeof ProductionRowSchema>;

/** CSV 형식이 기대와 다를 때. 메시지는 사용자에게 그대로 보여준다. */
export class CsvFormatError extends Error {}

export const PRODUCTION_REQUIRED_COLUMNS = [
  'date', 'line', 'product', 'planned_qty', 'actual_qty', 'good_qty', 'defect_qty', 'runtime_min', 'downtime_min',
] as const;

/** 필수 컬럼이 빠졌으면 어떤 컬럼이 필요하고 무엇을 받았는지 알려준다. */
export function assertColumns(header: string[], required: readonly string[], what: string): void {
  const missing = required.filter((c) => !header.includes(c));
  if (missing.length === 0) return;
  const got = header.slice(0, 8).join(', ') + (header.length > 8 ? ` 외 ${header.length - 8}개` : '');
  throw new CsvFormatError(
    `${what} CSV에 필요한 컬럼이 없습니다. 없는 컬럼: ${missing.join(', ')}. ` +
      `필요한 컬럼: ${required.join(', ')}. 받은 컬럼: ${got}`,
  );
}

/** 따옴표를 지원하는 최소 CSV 파서 (헤더 필수, 값에 줄바꿈 없음 가정). */
export function parseProductionCsv(csv: string): ProductionRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? '');
  assertColumns(header, PRODUCTION_REQUIRED_COLUMNS, '생산 실적');
  const numeric = new Set(['planned_qty', 'actual_qty', 'good_qty', 'defect_qty', 'runtime_min', 'downtime_min']);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const obj: Record<string, string | number> = {};
    header.forEach((h, i) => {
      const v = cells[i] ?? '';
      obj[h] = numeric.has(h) ? Number(v) : v;
    });
    return ProductionRowSchema.parse(obj);
  });
}

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
