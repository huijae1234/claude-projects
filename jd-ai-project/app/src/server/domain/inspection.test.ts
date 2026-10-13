import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type InspectionRow, analyzeInspection, parseInspectionCsv } from './inspection';
import { CsvFormatError } from './seed';

const csv = readFileSync('../sample-data/data/inspection_dairy_meat.csv', 'utf8');
const rows = parseInspectionCsv(csv);
const { series } = analyzeInspection(rows);
const by = (key: string) => series.find((s) => s.key === key)!;
const rules = (key: string, recentOnly = true) =>
  by(key).violations.filter((v) => !recentOnly || v.recent).map((v) => v.rule);

describe('검사 성적 샘플 데이터', () => {
  it('6개 항목 × 91일', () => {
    expect(series).toHaveLength(6);
    expect(rows).toHaveLength(6 * 91);
    for (const s of series) expect(s.n).toBe(91);
  });
});

describe('analyzeInspection — 심어둔 시나리오', () => {
  it('햄 중량: 규격 이탈 3건 + 평균 하락 → high, 하한 도달 예측', () => {
    const s = by('햄|중량');
    expect(s.risk).toBe('high');
    const oos = s.violations.filter((v) => v.rule === 'oos');
    expect(oos.reduce((a, v) => a + v.count, 0)).toBe(3);
    expect(rules('햄|중량')).toEqual(expect.arrayContaining(['oos', 'shift', 'trend', 'capability']));
    expect(s.cpk_recent).toBeLessThan(1.0);
    expect(s.trend?.limit).toBe('lower');
    expect(s.trend?.days_to_limit).toBeLessThan(14);
  });

  it('우유 산도: 규격 이내지만 평균 이동 → medium (조기 경보)', () => {
    const s = by('우유|산도');
    expect(s.risk).toBe('medium');
    expect(rules('우유|산도')).toContain('shift');
    expect(rules('우유|산도')).not.toContain('oos');
    expect(s.cpk_recent).toBeGreaterThan(1.33); // 아직 능력은 충분 → 이동만으로 잡혀야 한다
    const shift = s.violations.find((v) => v.rule === 'shift')!;
    expect(shift.from).toBe('2026-06-10');
  });

  it('소시지 염도: 서서히 상승 → medium, 상한 도달 예측', () => {
    const s = by('소시지|염도');
    expect(s.risk).toBe('medium');
    expect(rules('소시지|염도')).toEqual(expect.arrayContaining(['shift', 'trend']));
    expect(s.trend?.limit).toBe('upper');
    expect(s.trend?.days_to_limit).toBeGreaterThan(0);
    expect(rules('소시지|염도')).not.toContain('oos');
  });

  it('발효유 pH: 산포 증가 → medium, 평균은 그대로', () => {
    const s = by('발효유|pH');
    expect(s.risk).toBe('medium');
    expect(rules('발효유|pH')).toContain('spread');
    expect(Math.abs(s.recent.mean - s.baseline.mean)).toBeLessThan(s.baseline.sd); // 평균은 안 움직임
  });

  it('소시지 수분: 이탈은 없지만 공정능력 부족(Cpk) → medium', () => {
    const s = by('소시지|수분');
    expect(s.risk).toBe('medium');
    expect(rules('소시지|수분')).toEqual(['capability']);
  });

  it('우유 지방률: 안정 → low (현재 진행 중인 위반 없음)', () => {
    const s = by('우유|지방률');
    expect(s.risk).toBe('low');
    expect(s.violations.filter((v) => v.recent)).toHaveLength(0);
    expect(s.cpk_recent).toBeGreaterThan(1.67);
  });

  it('위험도 순으로 정렬된다 (high → medium → low)', () => {
    expect(series[0]!.key).toBe('햄|중량');
    expect(series[series.length - 1]!.key).toBe('우유|지방률');
  });

  it('점 단위 표시: 규격 이탈 점에 oos 플래그가 붙는다', () => {
    const p = by('햄|중량').points.find((x) => x.date === '2026-06-24')!;
    expect(p.value).toBe(194.2);
    expect(p.flags).toContain('oos');
  });
});

describe('analyzeInspection — 경계 조건', () => {
  const mk = (n: number, f: (i: number) => number, spec: Partial<InspectionRow> = {}): InspectionRow[] =>
    Array.from({ length: n }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      lot: '', product: 'P', test_item: 'T', unit: '', value: f(i), spec_min: null, spec_max: null, ...spec,
    }));

  it('측정값이 20개 미만이면 분석하지 않고 사유를 알려준다', () => {
    const r = analyzeInspection(mk(10, () => 5)).series[0]!;
    expect(r.risk).toBe('low');
    expect(r.risk_reasons[0]).toContain('최소 20개');
  });

  it('값이 전부 같아도(표준편차 0) 깨지지 않는다', () => {
    const r = analyzeInspection(mk(40, () => 5, { spec_min: 4, spec_max: 6 })).series[0]!;
    expect(r.risk).toBe('low');
    expect(Number.isFinite(r.baseline.ucl)).toBe(true);
  });

  it('규격이 없으면 Cpk는 null이고 관리도 규칙만 적용한다', () => {
    const r = analyzeInspection(mk(40, (i) => (i < 30 ? 10 + (i % 2) * 0.1 : 12))).series[0]!;
    expect(r.cpk_recent).toBeNull();
    expect(r.violations.some((v) => v.rule === 'beyond_3sigma' || v.rule === 'shift')).toBe(true);
  });

  it('빈 입력도 안전하다', () => {
    expect(analyzeInspection([])).toEqual({ series: [] });
  });
});

describe('CSV 형식 검증', () => {
  it('필수 컬럼이 없으면 안내한다', () => {
    expect(() => parseInspectionCsv('a,b\n1,2')).toThrow(CsvFormatError);
    expect(() => parseInspectionCsv('a,b\n1,2')).toThrow(/없는 컬럼: date, product, test_item, value/);
  });

  it('value가 숫자가 아니면 줄 번호와 함께 알려준다', () => {
    const bad = 'date,product,test_item,value\n2026-01-01,우유,산도,abc\n';
    expect(() => parseInspectionCsv(bad)).toThrow(/2번째 줄의 value가 숫자가 아닙니다/);
  });

  it('날짜 형식이 틀리면 알려준다', () => {
    expect(() => parseInspectionCsv('date,product,test_item,value\n01/02/2026,우유,산도,1\n')).toThrow(/date 형식/);
  });

  it('규격 컬럼 없이도 읽는다', () => {
    const r = parseInspectionCsv('date,product,test_item,value\n2026-01-01,우유,산도,0.15\n');
    expect(r[0]).toMatchObject({ value: 0.15, spec_min: null, spec_max: null });
  });
});
