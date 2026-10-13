import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeInspection, parseInspectionCsv } from '../server/domain/inspection';
import { memoFor } from './ncrMemo';

const { series } = analyzeInspection(parseInspectionCsv(readFileSync('../sample-data/data/inspection_dairy_meat.csv', 'utf8')));
const by = (k: string) => series.find((s) => s.key === k)!;

describe('memoFor — 검사 이상을 부적합 보고서 메모로', () => {
  const memo = memoFor(by('햄|중량'));

  it('품목·항목·규격이 들어간다', () => {
    expect(memo).toContain('햄 중량');
    expect(memo).toContain('규격 195~205g');
  });

  it('여러 번 흩어진 규격 이탈은 한 줄로 합쳐 총 건수와 최악값을 쓴다', () => {
    expect(memo).toContain('규격 이탈 3건');
    expect(memo).toContain('최악값 194.2');
    expect(memo.match(/규격 이탈/g)).toHaveLength(1);
  });

  it('관리한계 이탈도 합친다 (건건이 나열하지 않는다)', () => {
    expect(memo.match(/관리한계 이탈/g)).toHaveLength(1);
  });

  it('추세·공정능력·평균 비교가 들어가고 너무 길지 않다', () => {
    expect(memo).toMatch(/이 추세면 약 \d+일 뒤 규격 하한/);
    expect(memo).toContain('Cpk 0.58');
    expect(memo).toContain('최근 14개 평균 197.35g');
    expect(memo.length).toBeLessThan(400);
  });

  it('규격 이탈이 없는 항목은 그 사실을 쓰지 않는다', () => {
    const m = memoFor(by('우유|산도'));
    expect(m).not.toContain('규격 이탈');
    expect(m).toContain('평균이 올라감');
  });
});
