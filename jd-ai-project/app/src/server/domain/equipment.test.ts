import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeEquipment, parseEquipmentCsv } from './equipment';
import { CsvFormatError, parseProductionCsv } from './seed';

const csv = readFileSync('../sample-data/data/equipment_dairy_meat.csv', 'utf8');
const rows = parseEquipmentCsv(csv);
const { machines } = analyzeEquipment(rows);
const by = (id: string) => machines.find((m) => m.machine_id === id)!;

describe('설비 샘플 데이터', () => {
  it('8개 설비 × 181일', () => {
    expect(machines).toHaveLength(8);
    expect(rows).toHaveLength(8 * 181);
    expect(new Set(machines.map((m) => m.area))).toEqual(new Set(['유가공', '육가공']));
  });
});

describe('analyzeEquipment', () => {
  it('진행 중인 열화: TUM-01(베어링 과열)은 high, 베어링·진동이 기준 이탈', () => {
    const m = by('TUM-01');
    expect(m.risk).toBe('high');
    const metrics = m.current_flags.map((f) => f.metric);
    expect(metrics).toEqual(expect.arrayContaining(['bearing_temp_c', 'vibration_mms']));
    expect(m.breakdowns).toHaveLength(0);
  });

  it('진행 중인 열화: CUT-01(칼날 마모)은 low가 아니다', () => {
    const m = by('CUT-01');
    expect(m.risk).not.toBe('low');
    expect(m.current_flags.map((f) => f.metric)).toContain('vibration_mms');
  });

  it('정상 설비는 low (오탐 없음)', () => {
    for (const id of ['HOM-02', 'FIL-01', 'STF-01', 'SMK-01']) {
      expect(by(id).risk, id).toBe('low');
      expect(by(id).current_flags, id).toHaveLength(0);
    }
  });

  it('수리 완료된 설비(HOM-01, PAS-01)는 현재 low', () => {
    expect(by('HOM-01').risk).toBe('low');
    expect(by('PAS-01').risk).toBe('low');
  });

  it('고장 이력을 찾고, 전조 지표를 고장 직전 구간에서 찾아낸다', () => {
    const hom = by('HOM-01').breakdowns;
    expect(hom).toHaveLength(1);
    expect(hom[0]!.date).toBe('2026-06-11');
    expect(hom[0]!.downtime_min).toBe(340);
    const pre = hom[0]!.precursors;
    expect(pre.map((p) => p.metric)).toEqual(expect.arrayContaining(['vibration_mms', 'bearing_temp_c']));
    // 평균은 같고 변동만 커지는 압력은 'unstable'로 잡힌다
    const pressure = pre.find((p) => p.metric === 'process_pressure_bar');
    expect(pressure?.spread_ratio).toBeGreaterThanOrEqual(2.5);

    const pas = by('PAS-01').breakdowns[0]!;
    expect(pas.date).toBe('2026-04-15');
    expect(pas.precursors.map((p) => p.metric)).toContain('process_pressure_bar');
  });

  it('전조 없는 단발 고장(STF-01)은 전조가 비어 있다', () => {
    const b = by('STF-01').breakdowns[0]!;
    expect(b.date).toBe('2026-03-09');
    expect(b.precursors).toHaveLength(0);
  });

  it('위험도 높은 순으로 정렬된다', () => {
    expect(machines[0]!.risk).toBe('high');
    expect(machines[machines.length - 1]!.risk).toBe('low');
  });
});

describe('CSV 형식 검증', () => {
  it('필수 컬럼이 없으면 어떤 컬럼이 필요한지 알려준다', () => {
    const other = 'transaction_date,asset_tag,temp_bearing_degC\n2022-01-03,AST-1,63.3\n';
    expect(() => parseEquipmentCsv(other)).toThrow(CsvFormatError);
    expect(() => parseEquipmentCsv(other)).toThrow(/없는 컬럼: .*machine_id/);
    expect(() => parseEquipmentCsv(other)).toThrow(/받은 컬럼: transaction_date, asset_tag/);
  });

  it('생산 CSV도 같은 방식으로 안내한다', () => {
    expect(() => parseProductionCsv('a,b\n1,2')).toThrow(/생산 실적 CSV에 필요한 컬럼이 없습니다/);
  });

  it('날짜 형식 오류는 줄 번호와 함께 알려준다', () => {
    const bad = rows.length ? csv.split('\n')[0] + '\n01/02/2026,M1,기계,유가공,24,70,60,50,1,30,0,0,,0,0,,\n' : '';
    expect(() => parseEquipmentCsv(bad)).toThrow(/2번째 줄의 date 형식/);
  });

  it('선택 컬럼이 없어도 동작한다', () => {
    const lite = [
      'date,machine_id,machine_name,load_pct,motor_temp_c,bearing_temp_c,vibration_mms,motor_current_a,downtime_min,breakdown_flag',
      ...Array.from({ length: 20 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')},M1,기계,70,60,50,1.5,30,0,0`),
    ].join('\n');
    expect(analyzeEquipment(parseEquipmentCsv(lite)).machines[0]!.risk).toBe('low');
  });

  it('빈 입력도 안전하다', () => {
    expect(analyzeEquipment([])).toEqual({ machines: [] });
  });
});
