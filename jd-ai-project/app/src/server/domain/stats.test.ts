import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseProductionCsv } from './seed';
import { analyzeProduction } from './stats';

const rows = parseProductionCsv(readFileSync('seed/production.csv', 'utf8'));

describe('analyzeProduction', () => {
  const { perLine, flagged } = analyzeProduction(rows);

  it('라인별 통계를 3개 만든다', () => {
    expect(perLine.map((l) => l.line).sort()).toEqual(['A라인', 'B라인', 'C라인']);
    for (const l of perLine) {
      expect(l.avg_yield_pct).toBeGreaterThan(90);
      expect(l.availability_pct).toBeGreaterThan(90);
    }
  });

  it('심어둔 이상치 5행만 정확히 잡는다 (오탐 없음)', () => {
    expect(flagged.map((f) => `${f.date.slice(5)} ${f.line}`)).toEqual([
      '09-14 B라인',
      '09-15 B라인',
      '09-16 B라인',
      '09-22 C라인',
      '09-26 A라인',
    ]);
  });

  it('원인 유형을 구분한다', () => {
    const by = (d: string) => flagged.find((f) => f.date.endsWith(d))!;
    expect(by('-14').reasons).toContain('yield_drop');
    expect(by('-22').reasons).toEqual(expect.arrayContaining(['long_downtime', 'low_achievement']));
    expect(by('-26').reasons).toContain('yield_drop');
  });

  it('빈 입력도 안전하다', () => {
    expect(analyzeProduction([])).toEqual({ perLine: [], flagged: [] });
  });
});

describe('유가공·육가공 샘플 생산 데이터', () => {
  const dm = parseProductionCsv(readFileSync('../sample-data/data/production_dairy_meat.csv', 'utf8'));
  const res = analyzeProduction(dm);

  it('4개 라인, 일요일 제외 26일', () => {
    expect(res.perLine.map((l) => l.line).sort()).toEqual(['발효유라인', '소시지라인', '우유라인', '햄라인']);
    expect(dm).toHaveLength(26 * 4);
  });

  it('심어둔 이상치 6건만 정확히 잡는다 (설비 데이터의 고장과 같은 날짜)', () => {
    expect(res.flagged.map((f) => `${f.date.slice(5)} ${f.line}`)).toEqual([
      '06-09 우유라인',
      '06-10 우유라인',
      '06-11 우유라인',
      '06-24 소시지라인',
      '06-25 소시지라인',
      '06-26 소시지라인',
    ]);
    expect(res.flagged.find((f) => f.date.endsWith('-11'))!.reasons).toEqual(expect.arrayContaining(['long_downtime', 'low_achievement']));
  });
});

