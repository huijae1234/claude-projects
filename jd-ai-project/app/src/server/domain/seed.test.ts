import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ClaimSchema, ProductSchema, RegulationSchema, SupplierCaseSchema, SupplierSchema, parseProductionCsv } from './seed';

const read = (f: string) => readFileSync(`seed/${f}`, 'utf8');

describe('가상 시드 데이터', () => {
  const products = z.array(ProductSchema).parse(JSON.parse(read('products.json')));
  const regulations = z.array(RegulationSchema).parse(JSON.parse(read('regulations.json')));
  const claims = z.array(ClaimSchema).parse(JSON.parse(read('claims.json')));
  const rows = parseProductionCsv(read('production.csv'));

  it('품목 5종, 법규 3건, 클레임 8건', () => {
    expect(products).toHaveLength(5);
    expect(regulations).toHaveLength(3);
    expect(claims).toHaveLength(8);
  });

  it('법규는 모두 가상임을 명시한다', () => {
    for (const r of regulations) {
      expect(r.title).toContain('[가상]');
      expect(r.notice).toContain('가상');
    }
  });

  it('클레임마다 짧은 제목이 있다 (목록 표시용, 원문보다 짧게)', () => {
    for (const c of claims) {
      expect(c.title, c.id).toBeTruthy();
      expect(c.title!.length, c.id).toBeLessThanOrEqual(30);
      expect(c.title!.length, c.id).toBeLessThan(c.text.length);
    }
  });

  it('클레임의 product_id는 존재하는 품목을 가리킨다', () => {
    const ids = new Set(products.map((p) => p.id));
    for (const c of claims) expect(ids.has(c.product_id), c.id).toBe(true);
  });

  it('생산 데이터: 3개 라인, 일요일 제외, 수량이 일관된다', () => {
    expect(new Set(rows.map((r) => r.line)).size).toBe(3);
    expect(rows.length).toBeGreaterThanOrEqual(75);
    for (const r of rows) {
      expect(r.good_qty + r.defect_qty).toBe(r.actual_qty);
      expect(r.runtime_min + r.downtime_min).toBe(960);
    }
  });

  const yieldOf = (r: (typeof rows)[number]) => r.good_qty / r.actual_qty;

  it('심어둔 이상 1: B라인 14~16일 수율 하락', () => {
    const bad = rows.filter((r) => r.line === 'B라인' && /-1[456]$/.test(r.date));
    expect(bad).toHaveLength(3);
    for (const r of bad) expect(yieldOf(r)).toBeLessThan(0.97);
  });

  it('심어둔 이상 2: C라인 22일 장시간 정지', () => {
    const r = rows.find((x) => x.line === 'C라인' && x.date.endsWith('-22'))!;
    expect(r.downtime_min).toBeGreaterThan(180);
    expect(r.downtime_reason).toContain('모터');
  });

  it('심어둔 이상 3: A라인 26일 불량 급증', () => {
    const r = rows.find((x) => x.line === 'A라인' && x.date.endsWith('-26'))!;
    expect(yieldOf(r)).toBeLessThan(0.94);
    expect(r.defect_note).toContain('금속검출기');
  });

  it('정상일의 수율은 이상일보다 충분히 높다', () => {
    const normalA = rows.filter((r) => r.line === 'A라인' && !r.date.endsWith('-26'));
    for (const r of normalA) expect(yieldOf(r)).toBeGreaterThan(0.975);
  });
});

describe('협력업체 시드 데이터', () => {
  const suppliers = z.array(SupplierSchema).parse(JSON.parse(read('suppliers.json')));
  const cases = z.array(SupplierCaseSchema).parse(JSON.parse(read('supplier_cases.json')));

  it('업체 5곳, 상황 5건, 모두 가상임을 표시', () => {
    expect(suppliers).toHaveLength(5);
    expect(cases).toHaveLength(5);
    for (const s of suppliers) expect(s.note, s.id).toContain('가상');
  });

  it('상황의 supplier_id는 존재하는 업체를 가리킨다', () => {
    const ids = new Set(suppliers.map((s) => s.id));
    for (const c of cases) expect(ids.has(c.supplier_id), c.id).toBe(true);
  });

  it('이슈 이력 id는 전체에서 유일하다 (인용 검증이 id로 하므로)', () => {
    const all = suppliers.flatMap((s) => s.history.map((h) => h.id));
    expect(new Set(all).size).toBe(all.length);
  });
});

