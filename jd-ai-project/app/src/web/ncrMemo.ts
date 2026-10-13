import type { RuleId, SeriesAnalysis, Violation } from '../server/domain/inspection';

export const RULE_LABEL: Record<RuleId, string> = {
  oos: '규격 이탈', beyond_3sigma: '관리한계 이탈', shift: '평균 이동', trend: '추세', spread: '산포 증가', capability: '공정능력 부족',
};

/**
 * 검사 이상 탐지 결과를 부적합 보고서 메모로 바꾼다.
 * 같은 종류의 이탈(여러 날에 흩어진 규격 이탈 등)은 건수를 합쳐 한 줄로 만든다.
 */
export function memoFor(s: SeriesAnalysis): string {
  const spec = `규격 ${s.spec_min ?? '-'}~${s.spec_max ?? '-'}${s.unit}`;
  const byRule = new Map<RuleId, Violation[]>();
  for (const v of s.violations.filter((x) => x.recent)) byRule.set(v.rule, [...(byRule.get(v.rule) ?? []), v]);

  const parts = [...byRule].map(([rule, vs]) => {
    if (rule === 'oos' || rule === 'beyond_3sigma') {
      const total = vs.reduce((a, v) => a + v.count, 0);
      const worst = vs.map((v) => /최악값 ([\d.]+)/.exec(v.detail)?.[1]).find(Boolean);
      return `${RULE_LABEL[rule]} ${total}건 (${vs[0]!.from.slice(5)}~${vs[vs.length - 1]!.to.slice(5)}${worst ? `, 최악값 ${worst}` : ''})`;
    }
    return vs[0]!.detail;
  });
  return `[검사 이상] ${s.product} ${s.test_item} (${spec}). ${parts.join(' / ')}. 최근 14개 평균 ${s.recent.mean}${s.unit} (기준선 평균 ${s.baseline.mean}${s.unit}).`;
}
