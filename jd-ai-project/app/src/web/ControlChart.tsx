import type { SeriesAnalysis } from '../server/domain/inspection';

const W = 680;
const H = 220;
const M = { l: 52, r: 14, t: 14, b: 28 };

/** 소수 자릿수: 표준편차가 작을수록 더 자세히 */
const decimals = (sd: number) => Math.min(4, Math.max(0, Math.ceil(-Math.log10(Math.max(sd, 1e-9))) + 1));

/**
 * 관리도(개별값 차트). 정상 기준선의 평균·±3σ와 규격 한계를 선으로, 규칙에 걸린 점을 색으로 표시한다.
 * 색만으로 구분하지 않도록 점 모양도 다르게 한다(규격 이탈=사각형, 관리한계 이탈=마름모).
 */
export function ControlChart({ s }: { s: SeriesAnalysis }) {
  const { points, baseline, spec_min: lo, spec_max: hi } = s;
  const n = points.length;
  const d = decimals(baseline.sd);
  const fmt = (v: number) => v.toFixed(d);

  const vals = points.map((p) => p.value);
  const candidates = [...vals, baseline.ucl, baseline.lcl, ...(lo !== null ? [lo] : []), ...(hi !== null ? [hi] : [])];
  let yMin = Math.min(...candidates);
  let yMax = Math.max(...candidates);
  const pad = (yMax - yMin) * 0.08 || 1;
  yMin -= pad;
  yMax += pad;

  const x = (i: number) => M.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - M.l - M.r));
  const y = (v: number) => M.t + (1 - (v - yMin) / (yMax - yMin)) * (H - M.t - M.b);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const yTicks = [yMin + pad, (yMin + yMax) / 2, yMax - pad];
  const xTicks = [0, Math.floor((n - 1) / 2), n - 1];
  const recentStart = Math.max(0, n - s.recent.n);

  const flagged = points.filter((p) => p.flags.includes('oos') || p.flags.includes('beyond_3sigma')).length;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${s.product} ${s.test_item} 관리도. 측정 ${n}개 중 규격 이탈 또는 관리한계 이탈 ${flagged}개`}>
      {/* 기준선 구간 · 최근 구간 */}
      <rect className="c-base" x={x(0)} y={M.t} width={x(Math.max(0, baseline.n - 1)) - x(0)} height={H - M.t - M.b} />
      <rect className="c-recent" x={x(recentStart)} y={M.t} width={x(n - 1) - x(recentStart)} height={H - M.t - M.b} />

      {/* 눈금 */}
      {yTicks.map((t) => (
        <g key={t}>
          <line className="c-grid" x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} />
          <text className="c-axis" x={M.l - 6} y={y(t) + 4} textAnchor="end">{fmt(t)}</text>
        </g>
      ))}
      {xTicks.map((i, k) => (
        <text key={i} className="c-axis" x={x(i)} y={H - 8} textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}>{points[i]!.date.slice(5)}</text>
      ))}

      {/* 관리한계 · 규격 */}
      <line className="c-limit" x1={M.l} x2={W - M.r} y1={y(baseline.ucl)} y2={y(baseline.ucl)} />
      <line className="c-limit" x1={M.l} x2={W - M.r} y1={y(baseline.lcl)} y2={y(baseline.lcl)} />
      <line className="c-center" x1={M.l} x2={W - M.r} y1={y(baseline.mean)} y2={y(baseline.mean)} />
      <text className="c-label" x={M.l + 4} y={y(baseline.ucl) + 12}>관리 상한 {fmt(baseline.ucl)}</text>
      <text className="c-label" x={M.l + 4} y={y(baseline.lcl) - 4}>관리 하한 {fmt(baseline.lcl)}</text>
      {hi !== null && (
        <>
          <line className="c-spec" x1={M.l} x2={W - M.r} y1={y(hi)} y2={y(hi)} />
          <text className="c-label spec" x={M.l + 4} y={y(hi) - 4}>규격 상한 {hi}</text>
        </>
      )}
      {lo !== null && (
        <>
          <line className="c-spec" x1={M.l} x2={W - M.r} y1={y(lo)} y2={y(lo)} />
          <text className="c-label spec" x={M.l + 4} y={y(lo) + 12}>규격 하한 {lo}</text>
        </>
      )}

      {/* 값 */}
      <path className="c-line" d={line} />
      {points.map((p, i) => {
        const cx = x(i);
        const cy = y(p.value);
        if (p.flags.includes('oos')) return <rect key={i} className="c-oos" x={cx - 4.5} y={cy - 4.5} width={9} height={9}><title>{`${p.date} ${p.value} 규격 이탈`}</title></rect>;
        if (p.flags.includes('beyond_3sigma')) return <path key={i} className="c-beyond" d={`M${cx},${cy - 5.5} L${cx + 5.5},${cy} L${cx},${cy + 5.5} L${cx - 5.5},${cy} Z`}><title>{`${p.date} ${p.value} 관리한계 이탈`}</title></path>;
        if (p.flags.includes('shift')) return <circle key={i} className="c-shift" cx={cx} cy={cy} r={2.8}><title>{`${p.date} ${p.value} 평균 이동 구간`}</title></circle>;
        return <circle key={i} className="c-dot" cx={cx} cy={cy} r={1.8} />;
      })}
    </svg>
  );
}

export function ChartLegend() {
  return (
    <p className="legend" aria-hidden="true">
      <span><i className="lg oos" /> 규격 이탈</span>
      <span><i className="lg beyond" /> 관리한계(±3σ) 이탈</span>
      <span><i className="lg shift" /> 평균 이동 구간</span>
      <span><i className="lg spec" /> 규격 한계</span>
      <span><i className="lg limit" /> 관리한계</span>
      <span><i className="lg area base" /> 정상 기준선 구간</span>
      <span><i className="lg area recent" /> 최근 14개</span>
    </p>
  );
}
