import { useState } from 'react';
import type { HygieneResult } from '../../server/application/tools';
import type { HygieneAnalysis, PlantSummary } from '../../server/domain/hygiene';
import { api } from '../api';
import { AiWait, Badge, CopyButton, CsvPicker, Disclaimer, metaOf, RunStatus, usePreviewRun } from '../ui';

const RISK = { high: ['red', '위험 높음'], medium: ['orange', '주의'], low: ['green', '양호'] } as const;
const URGENCY = { immediate: ['red', '즉시'], within_week: ['orange', '1주 내'], next_pm: ['gray', '다음 점검 전'] } as const;
const SEV_TONE = { 상: 'red', 중: 'orange', 하: 'yellow' } as const;

export function HygieneTool() {
  const [csv, setCsv] = useState('');
  const { preview, full, loading, error, cancelled, start, cancel } = usePreviewRun<{ analysis: HygieneAnalysis }, HygieneResult>();
  const analysis = full?.analysis ?? preview?.analysis; // 집계는 AI를 기다리지 않고 먼저 보여준다
  const ai = full?.ai;
  const aiBy = new Map(ai?.plant_assessments.map((a) => [a.plant, a]));
  const months = analysis?.plants[0]?.monthly.map((m) => m.month) ?? [];

  return (
    <section className="tool">
      <h3>위생점검 분석</h3>
      <p className="muted">
        반복 지적·기한 초과 시정조치·여러 공장 공통 문제는 코드가 집계하고, 원인 추정·조치·다음 점검 중점·보고서 초안은 AI가 만듭니다.
      </p>
      <CsvPicker
        tool="hygiene"
        requiredHint="date, plant, area, item, result(적합/부적합) (선택: severity(상/중/하), finding, due_date, closed_date)"
        onChange={(c) => setCsv(c)}
      />
      <div className="row">
        <button
          disabled={loading || !csv}
          onClick={() =>
            start(
              (signal) => api<{ analysis: HygieneAnalysis }>('/api/tools/hygiene/preview', { csv }, signal),
              (signal) => api<HygieneResult>('/api/tools/hygiene', { csv }, signal),
            )
          }
        >
          분석하기
        </button>
      </div>
      <RunStatus loading={loading} error={error} cancelled={cancelled} onCancel={cancel} typical="25~50초" what="AI가 해석 중입니다" />

      {analysis && (
        <div className="result">
          <h4>AI 요약</h4>
          {ai ? <p className="headline">{ai.headline}</p> : loading && <AiWait>AI가 해석하는 중입니다. 아래 집계는 코드가 계산한 확정 값입니다.</AiWait>}

          <h4>공장별 현황 <small>(기준일 {analysis.as_of} · 위험도순)</small></h4>
          <div className="risk-grid">
            {analysis.plants.map((p) => <PlantCard key={p.plant} p={p} />)}
          </div>

          {analysis.overdue.length > 0 && (
            <>
              <h4>기한이 지난 시정조치 <small>(아직 닫히지 않음)</small></h4>
              <div className="table-wrap"><table>
                <thead><tr><th>공장</th><th>항목</th><th>심각도</th><th>시정 기한</th><th>초과</th><th>지적 내용</th></tr></thead>
                <tbody>
                  {analysis.overdue.map((o, i) => (
                    <tr key={i}>
                      <td>{o.plant}</td><td>{o.item}</td>
                      <td>{o.severity && <Badge tone={SEV_TONE[o.severity]}>{o.severity}</Badge>}</td>
                      <td>{o.due_date}</td><td><b className="bad-text">{o.days_overdue}일</b></td><td>{o.finding}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </>
          )}

          {analysis.recurring.length > 0 && (
            <>
              <h4>반복 지적 <small>(최근 점검 중 같은 항목이 3회 이상 부적합)</small></h4>
              <div className="table-wrap"><table>
                <thead><tr><th>공장</th><th>항목</th><th>발생 ({months.map((m) => Number(m.slice(5))).join('·')}월)</th><th>최근 심각도</th><th>최근 지적</th></tr></thead>
                <tbody>
                  {analysis.recurring.map((r, i) => (
                    <tr key={i}>
                      <td>{r.plant}</td>
                      <td>{r.item}{r.worsening && <> <Badge tone="red">악화</Badge></>}</td>
                      <td>
                        <span className="dots" aria-label={`${r.of_audits}회 중 ${r.count}회 부적합`}>
                          {months.map((m) => <i key={m} className={r.months.includes(m) ? 'on' : ''} title={m} />)}
                        </span>{' '}
                        <small>{r.count}/{r.of_audits}회</small>
                      </td>
                      <td>{r.latest_severity && <Badge tone={SEV_TONE[r.latest_severity]}>{r.latest_severity}</Badge>}</td>
                      <td>{r.latest_finding}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </>
          )}

          {analysis.systemic.length > 0 && (
            <>
              <h4>여러 공장 공통 문제 <small>(최근 2개월, 2개 공장 이상)</small></h4>
              <ul className="systemic">
                {analysis.systemic.map((s) => (
                  <li key={s.item}><b>{s.item}</b> — {s.plants.join(', ')} <span className="muted">({s.months.join(', ')})</span></li>
                ))}
              </ul>
            </>
          )}

          {ai && (
            <>
              <h4>공장별 진단과 조치</h4>
              {analysis.plants.filter((p) => aiBy.has(p.plant)).map((p) => {
                const a = aiBy.get(p.plant)!;
                return (
                  <div className={`card risk-${p.risk} plant-ai`} key={p.plant}>
                    <div className="row tight"><strong>{p.plant}</strong><Badge tone={RISK[p.risk][0]}>{RISK[p.risk][1]}</Badge></div>
                    <p>{a.summary}</p>
                    {a.probable_causes.length > 0 && <><h5>추정 원인</h5><ul>{a.probable_causes.map((c, i) => <li key={i}>{c}</li>)}</ul></>}
                    {a.actions.length > 0 && (
                      <>
                        <h5>조치</h5>
                        <ul>{a.actions.map((x, i) => <li key={i}><Badge tone={URGENCY[x.urgency][0]}>{URGENCY[x.urgency][1]}</Badge> {x.action} <span className="muted">· {x.owner}</span></li>)}</ul>
                      </>
                    )}
                  </div>
                );
              })}
              {full && full.unknown_plants_dropped > 0 && <p className="muted">점검 기록에 없는 공장 {full.unknown_plants_dropped}건은 결과에서 제외했습니다.</p>}

              {ai.systemic_actions.length > 0 && <><h4>본사 차원 조치 <small>(공통 문제)</small></h4><ul>{ai.systemic_actions.map((x, i) => <li key={i}>{x}</li>)}</ul></>}

              <h4>다음 점검 중점 항목 <small>(점검표에 있는 항목인지 코드가 대조)</small></h4>
              <div className="table-wrap"><table>
                <thead><tr><th>공장</th><th>항목</th><th>이유</th><th>대조</th></tr></thead>
                <tbody>
                  {ai.next_audit_focus.map((f, i) => (
                    <tr key={i}>
                      <td>{f.plant}</td><td>{f.item}</td><td>{f.reason}</td>
                      <td><Badge tone={f.verified ? 'green' : 'orange'}>{f.verified ? '점검표 항목' : '점검표에 없음'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>

              <div className="row between"><h4>월간 위생점검 보고서 초안</h4><CopyButton text={ai.report_markdown} /></div>
              <pre className="doc">{ai.report_markdown}</pre>
              <Disclaimer meta={metaOf(full)} />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function PlantCard({ p }: { p: PlantSummary }) {
  const max = Math.max(1, ...p.monthly.map((m) => m.nc));
  return (
    <div className={`card risk-${p.risk}`}>
      <div className="row"><strong>{p.plant}</strong><Badge tone={RISK[p.risk][0]}>{RISK[p.risk][1]}</Badge></div>
      <p className="kv">부적합 {p.nonconformities}건 / 점검 {p.checks}항목 ({p.nc_rate_pct}%)</p>
      <p className="kv">미결 {p.open}건 · <span className={p.overdue ? 'bad-text' : ''}>기한 초과 {p.overdue}건</span> · 늦게 닫힘 {p.closed_late}건</p>
      <div className="minibars" role="img" aria-label={`월별 부적합 건수: ${p.monthly.map((m) => `${Number(m.month.slice(5))}월 ${m.nc}건`).join(', ')}`}>
        {p.monthly.map((m) => (
          <span key={m.month} title={`${m.month}: ${m.nc}건`}>
            <i style={{ height: `${(m.nc / max) * 100}%` }} />
            <small>{Number(m.month.slice(5))}</small>
          </span>
        ))}
      </div>
      {p.risk_reasons.map((r) => <p className="kv" key={r}>• {r}</p>)}
    </div>
  );
}
