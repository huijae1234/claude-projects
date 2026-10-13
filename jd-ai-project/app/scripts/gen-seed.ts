/**
 * 가상 생산 데이터 생성 (시드 고정이라 항상 같은 결과).
 * 실행: npx tsx scripts/gen-seed.ts  → seed/production.csv
 * 가상의 식품회사 "한결식품" 데이터이며 실제 회사와 무관하다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261012);
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;

interface Line {
  line: string;
  product: string;
  planned: number;
  baseYield: number;
  minorStops: string[];
}

const LINES: Line[] = [
  { line: 'A라인', product: 'P-RAMEN', planned: 42000, baseYield: 0.985, minorStops: ['스프 투입기 센서 오작동 재설정', '포장기 필름 교체', '면대 롤러 청소', '컨베이어 정지 후 재가동'] },
  { line: 'B라인', product: 'P-SAUCE', planned: 18000, baseYield: 0.992, minorStops: ['충진 노즐 막힘 세척', '캡핑 헤드 조정', '라벨러 용지 교체', '충진량 보정'] },
  { line: 'C라인', product: 'P-CURRY', planned: 12000, baseYield: 0.988, minorStops: ['레토르트 트레이 정렬 불량', '실링 온도 재설정', '살균솥 대기', '파우치 공급 지연'] },
];

const rows: string[] = ['date,line,product,planned_qty,actual_qty,good_qty,defect_qty,runtime_min,downtime_min,downtime_reason,defect_note'];

for (let d = 1; d <= 30; d++) {
  const date = `2026-09-${String(d).padStart(2, '0')}`;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekday === 0) continue; // 일요일 휴무

  for (const l of LINES) {
    let achievement = between(0.95, 1.01);
    let yieldRate = l.baseYield + between(-0.004, 0.004);
    let downtime = Math.round(between(15, 45));
    let reason = pick(l.minorStops);
    let note = '';

    // 심어둔 이상 1: B라인 14~16일 실링/충진 문제로 수율 하락
    if (l.line === 'B라인' && d >= 14 && d <= 16) {
      yieldRate = 0.955 - (d - 14) * 0.006 + between(-0.003, 0.003);
      note = '캡 실링 불량 및 충진량 편차 증가';
      reason = '충진 노즐 막힘 세척';
      downtime += 25;
    }
    // 심어둔 이상 2: C라인 22일 설비 고장으로 장시간 정지
    if (l.line === 'C라인' && d === 22) {
      downtime = 210;
      reason = '살균솥 순환 모터 과열로 비상 정지, 정비팀 교체';
      achievement = 0.71;
    }
    // 심어둔 이상 3: A라인 26일 금속검출기 불량 급증
    if (l.line === 'A라인' && d === 26) {
      yieldRate = 0.931;
      note = '금속검출기 검출 다발, 면대 절단 롤러 마모 의심';
      reason = '금속검출기 반복 검출로 라인 정지 및 점검';
      downtime = 95;
    }

    const planned = l.planned;
    const actual = Math.round(planned * achievement);
    const good = Math.round(actual * yieldRate);
    const defect = actual - good;
    const runtime = 960 - downtime; // 16시간 가동 기준
    rows.push([date, l.line, l.product, planned, actual, good, defect, runtime, downtime, `"${reason}"`, `"${note}"`].join(','));
  }
}

mkdirSync('seed', { recursive: true });
writeFileSync('seed/production.csv', rows.join('\n') + '\n', 'utf8');
console.log(`seed/production.csv: ${rows.length - 1} rows`);
