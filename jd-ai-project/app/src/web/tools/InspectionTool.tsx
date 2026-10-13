import { useState } from 'react';
import type { InspectionResult } from '../../server/application/tools';
import type { SeriesAnalysis, Violation } from '../../server/domain/inspection';
import { api } from '../api';
import { ChartLegend, ControlChart } from '../ControlChart';
import { RULE_LABEL, memoFor } from '../ncrMemo';
import { Badge, CsvPicker, Disclaimer, RunStatus, useRun } from '../ui';

const RISK = { high: ['red', '위험 높음'], medium: ['orange', '주의'], low: ['green', '정상'] } as const;
const URGENCY = { immediate: ['red', '즉시'], within_week: ['orange', '1주 내'], next_pm: ['gray', '다음 정기점검'] } as const;

/** 부적합 보고서 탭으로 보낼 초안 메모 (탭 사이는 window 이벤트로 느슨하게 연결) */
export const NCR_PREFILL_EVENT = 'ncr-prefill';

export function InspectionTool() {
  const [csv, setCsv] = useState('');
  const { loading, error, data, run } = useRun<InspectionResult>();
  const aiBy = new Map(data?.ai.assessments.map((a) => [a.series_key, a]));
  const counts = { high: 0, medium: 0, low: 0 };
  data?.analysis.series.forEach((s) => (counts[s.risk] += 1));

  return (
    <section className="tool">
      <h3>검사 데이터 이상 탐지</h3>
      <p className="muted">
        관리도·공정능력·추세는 코드가 계산하고, 이상의 의미와 원인 추정·조치 제안은 AI가 만듭니다. 규격 안이어도 서서히 나빠지는 변화를 먼저 찾습니다.
      </p>
      <CsvPicker
        tool="inspection"
        requiredHint="date, product, test_item, value (선택: lot, unit, spec_min, spec_max)"
        onChange={(c) => setCsv(c)}
      />
      <div className="row">
        <button disabled={loading || !csv} onClick={() => run(() => api<InspectionResult>('/api/tools/inspection', { csv }))}>
          이상 탐지하기
        </button>
      </div>
      <RunStatus loading={loading} error={error} />

      {data && (
        <div className="result">
          <h4>AI 요약</h4>
          <p className="headline">{data.ai.headline}</p>

          <div className="tiles" aria-label="위험도 요약">
            <div className="tile red"><b>{counts.high}</b><span>위험 높음</span></div>
            <div className="tile orange"><b>{counts.medium}</b><span>주의</span></div>
            <div className="tile green"><b>{counts.low}</b><span>정상</span></div>
          </div>

          <h4>검사 항목별 관리도 <small>(코드 계산 · 위험도순)</small></h4>
          <ChartLegend />
          {data.analysis.series.map((s) => (
            <SeriesCard key={s.key} s={s} ai={aiBy.get(s.key)} />
          ))}
          {data.unknown_series_dropped > 0 && <p className="muted">존재하지 않는 항목 {data.unknown_series_dropped}건은 결과에서 제외했습니다.</p>}

          {data.ai.monitoring_suggestions.length > 0 && (
            <>
              <h4>모니터링 제안</h4>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>대상</th><th>제안</th></tr></thead>
                  <tbody>
                    {data.ai.monitoring_suggestions.map((m, i) => (
                      <tr key={i}><td>{m.target}</td><td>{m.suggestion}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <Disclaimer />
        </div>
      )}
    </section>
  );
}

function SeriesCard({ s, ai }: { s: SeriesAnalysis; ai?: InspectionResult['ai']['assessments'][number] }) {
  const recent = s.violations.filter((v) => v.recent);
  const past = s.violations.filter((v) => !v.recent);
  const unit = s.unit;
  const spec = [s.spec_min !== null ? `하한 ${s.spec_min}` : '', s.spec_max !== null ? `상한 ${s.spec_max}` : ''].filter(Boolean).join(' · ');

  return (
    <div className={`card series risk-${s.risk}`}>
      <div className="series-head">
        <div>
          <strong>{s.product} · {s.test_item}</strong>
          <span className="muted"> {spec && `규격 ${spec}${unit}`}</span>
        </div>
        <div className="row tight">
          {ai?.needs_ncr && <Badge tone="red">부적합 보고서 필요</Badge>}
          <Badge tone={RISK[s.risk][0]}>{RISK[s.risk][1]}</Badge>
        </div>
      </div>

      <ControlChart s={s} />

      <dl className="metrics">
        <div><dt>기준선 평균</dt><dd>{s.baseline.mean}{unit} <small>±{s.baseline.sd}</small></dd></div>
        <div><dt>최근 14개 평균</dt><dd>{s.recent.mean}{unit}</dd></div>
        <div><dt>Cpk (최근 30개)</dt><dd className={s.cpk_recent !== null && s.cpk_recent < 1 ? 'bad' : s.cpk_recent !== null && s.cpk_recent < 1.33 ? 'warn' : ''}>{s.cpk_recent ?? '-'}</dd></div>
        <div>
          <dt>추세 예측</dt>
          <dd>{s.trend?.days_to_limit != null && Math.abs(s.trend.t) >= 3 ? `약 ${s.trend.days_to_limit}일 뒤 ${s.trend.limit === 'upper' ? '상한' : '하한'}` : '뚜렷한 추세 없음'}</dd>
        </div>
      </dl>

      {recent.length > 0 ? (
        <ul className="viols">{recent.map((v, i) => <ViolationItem key={i} v={v} />)}</ul>
      ) : (
        <p className="kv">현재 진행 중인 이상 징후가 없습니다.{past.length > 0 && ` (과거 일시적 이탈 ${past.length}건)`}</p>
      )}

      {ai && (
        <div className="ai-box">
          <p>{ai.interpretation}</p>
          {ai.probable_causes.length > 0 && (
            <>
              <h5>추정 원인</h5>
              <ul>{ai.probable_causes.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </>
          )}
          {ai.actions.length > 0 && (
            <>
              <h5>조치</h5>
              <ul>
                {ai.actions.map((a, i) => (
                  <li key={i}><Badge tone={URGENCY[a.urgency][0]}>{URGENCY[a.urgency][1]}</Badge> {a.action} <span className="muted">· {a.owner}</span></li>
                ))}
              </ul>
            </>
          )}
          {ai.needs_ncr && (
            <button
              className="ghost"
              onClick={() => window.dispatchEvent(new CustomEvent(NCR_PREFILL_EVENT, { detail: { text: memoFor(s) } }))}
            >
              이 내용으로 부적합 보고서 쓰기 →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ViolationItem({ v }: { v: Violation }) {
  return (
    <li>
      <Badge tone={v.rule === 'oos' ? 'red' : v.rule === 'capability' || v.rule === 'spread' ? 'orange' : 'yellow'}>{RULE_LABEL[v.rule]}</Badge>{' '}
      {v.detail} <span className="muted">({v.from === v.to ? v.from.slice(5) : `${v.from.slice(5)}~${v.to.slice(5)}`})</span>
    </li>
  );
}
