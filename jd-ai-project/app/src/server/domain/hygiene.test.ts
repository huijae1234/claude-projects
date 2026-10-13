import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type HygieneRow, analyzeHygiene, parseHygieneCsv } from './hygiene';
import { CsvFormatError } from './seed';

const rows = parseHygieneCsv(readFileSync('../sample-data/data/hygiene_audits.csv', 'utf8'));
const a = analyzeHygiene(rows);
const plant = (p: string) => a.plants.find((x) => x.plant === p)!;

describe('위생점검 샘플 데이터', () => {
  it('3개 공장 × 6개월 × 10개 항목, 기준일은 마지막 점검일', () => {
    expect(rows).toHaveLength(180);
    expect(a.checklist).toHaveLength(10);
    expect(a.as_of).toBe('2026-06-15');
    for (const p of a.plants) expect(p.audits).toBe(6);
  });
});

describe('analyzeHygiene — 심어둔 시나리오', () => {
  it('반복 지적 2건을 정확히 찾는다 (무작위 지적은 반복으로 잡지 않는다)', () => {
    expect(a.recurring.map((r) => `${r.plant}|${r.item}`).sort()).toEqual(['음성공장|냉장·냉동 온도 기록', '평택공장|방충망·출입문 밀폐']);
  });

  it('음성 온도 기록: 4회 반복 + 심각도 하→중 악화', () => {
    const r = a.recurring.find((x) => x.plant === '음성공장')!;
    expect(r).toMatchObject({ count: 4, of_audits: 6, worsening: true, latest_severity: '중' });
    expect(r.months).toEqual(['2026-03', '2026-04', '2026-05', '2026-06']);
  });

  it('평택 방충망: 4회 반복이지만 악화는 아님', () => {
    expect(a.recurring.find((x) => x.plant === '평택공장')).toMatchObject({ count: 4, worsening: false });
  });

  it('기한 초과는 안양 알레르기 원료 보관(상) 1건뿐 — 6월 재발 건은 아직 기한 전', () => {
    expect(a.overdue).toHaveLength(1);
    expect(a.overdue[0]).toMatchObject({ plant: '안양공장', item: '원료 보관 구분(알레르기)', severity: '상', due_date: '2026-05-19', days_overdue: 27 });
  });

  it('여러 공장 공통 문제: 6월 포충등 관리 기록이 3개 공장 모두에서', () => {
    expect(a.systemic).toEqual([{ item: '포충등 관리 기록', plants: ['안양공장', '음성공장', '평택공장'], months: ['2026-06'] }]);
  });

  it('위험도: 안양(중대 기한 초과)·음성(반복+악화)은 high, 평택(반복만)은 medium', () => {
    expect(plant('안양공장').risk).toBe('high');
    expect(plant('음성공장').risk).toBe('high');
    expect(plant('평택공장').risk).toBe('medium');
    expect(a.plants[a.plants.length - 1]!.plant).toBe('평택공장'); // 위험도순 정렬
  });

  it('공장별 집계: 월별 추이와 처리 지표', () => {
    const p = plant('음성공장');
    expect(p.monthly).toHaveLength(6);
    expect(p.monthly.reduce((s, m) => s + m.nc, 0)).toBe(p.nonconformities);
    expect(p.nc_rate_pct).toBeCloseTo((p.nonconformities / 60) * 100, 1);
    expect(p.avg_days_to_close).not.toBeNull();
  });
});

describe('analyzeHygiene — 경계 조건', () => {
  const r = (over: Partial<HygieneRow>): HygieneRow => ({
    date: '2026-01-01', plant: 'P', area: 'A', item: 'I', nonconforming: false, severity: null, finding: '', due_date: null, closed_date: null, ...over,
  });

  it('기준일을 직접 주면 그 날짜로 기한 초과를 판단한다', () => {
    const rs = [r({ nonconforming: true, severity: '하', due_date: '2026-01-10' })];
    expect(analyzeHygiene(rs, { asOf: '2026-01-05' }).overdue).toHaveLength(0);
    expect(analyzeHygiene(rs, { asOf: '2026-01-20' }).overdue[0]!.days_overdue).toBe(10);
  });

  it('닫힌 지적은 기한이 지났어도 기한 초과가 아니고, 늦게 닫힌 건으로 센다', () => {
    const rs = [r({ nonconforming: true, severity: '중', due_date: '2026-01-10', closed_date: '2026-01-15' })];
    const res = analyzeHygiene(rs, { asOf: '2026-02-01' });
    expect(res.overdue).toHaveLength(0);
    expect(res.plants[0]!.closed_late).toBe(1);
  });

  it('빈 입력도 안전하다', () => {
    expect(analyzeHygiene([]).plants).toEqual([]);
  });
});

describe('CSV 형식 검증', () => {
  it('필수 컬럼이 없으면 안내한다', () => {
    expect(() => parseHygieneCsv('a,b\n1,2')).toThrow(/없는 컬럼: date, plant, area, item, result/);
  });
  it('result 값이 적합/부적합이 아니면 줄 번호와 함께 알려준다', () => {
    expect(() => parseHygieneCsv('date,plant,area,item,result\n2026-01-01,P,A,I,OK\n')).toThrow(CsvFormatError);
    expect(() => parseHygieneCsv('date,plant,area,item,result\n2026-01-01,P,A,I,OK\n')).toThrow(/2번째 줄의 result/);
  });
  it('선택 컬럼이 없어도 읽는다', () => {
    expect(parseHygieneCsv('date,plant,area,item,result\n2026-01-01,P,A,I,부적합\n')[0]).toMatchObject({ nonconforming: true, severity: null, due_date: null });
  });
});
