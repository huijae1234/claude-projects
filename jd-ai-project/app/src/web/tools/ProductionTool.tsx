import { useState } from 'react';
import type { ProductionResult } from '../../server/application/tools';
import { api } from '../api';
import { CopyButton, CsvPicker, Disclaimer, RunStatus, useRun } from '../ui';

const REASON: Record<string, string> = { yield_drop: '수율 하락', long_downtime: '장시간 정지', low_achievement: '계획 미달' };

export function ProductionTool() {
  const [csv, setCsv] = useState<string>('');
  const { loading, error, data, run } = useRun<ProductionResult>();

  return (
    <section className="tool">
      <h3>생산지표 분석·보고서</h3>
      <p className="muted">숫자 계산과 이상치 탐지는 코드가, 원인 가설과 보고서는 AI가 만듭니다.</p>
      <CsvPicker
        tool="production"
        requiredHint="date, line, product, planned_qty, actual_qty, good_qty, defect_qty, runtime_min, downtime_min (선택: downtime_reason, defect_note)"
        onChange={(c) => setCsv(c)}
      />
      <div className="row">
        <button disabled={loading || !csv} onClick={() => run(() => api<ProductionResult>('/api/tools/production', { csv }))}>
          분석하기
        </button>
      </div>
      <RunStatus loading={loading} error={error} />

      {data && (
        <div className="result">
          <h4>라인별 통계 <small>(코드 계산)</small></h4>
          <div className="table-wrap"><table>
            <thead><tr><th>라인</th><th>품목</th><th>가동일</th><th>평균 수율</th><th>계획 달성률</th><th>정지 합계(분)</th><th>가동률</th></tr></thead>
            <tbody>
              {data.stats.perLine.map((l) => (
                <tr key={l.line}><td>{l.line}</td><td>{l.product}</td><td>{l.days}</td><td>{l.avg_yield_pct}%</td><td>{l.avg_achievement_pct}%</td><td>{l.total_downtime_min}</td><td>{l.availability_pct}%</td></tr>
              ))}
            </tbody>
          </table></div>

          <h4>탐지된 이상치 {data.stats.flagged.length}건 <small>(코드 탐지)</small></h4>
          <div className="table-wrap"><table>
            <thead><tr><th>날짜</th><th>라인</th><th>유형</th><th>수율</th><th>달성률</th><th>정지(분)</th><th>현장 기록</th></tr></thead>
            <tbody>
              {data.stats.flagged.map((f) => (
                <tr key={f.date + f.line}>
                  <td>{f.date.slice(5)}</td><td>{f.line}</td><td>{f.reasons.map((r) => REASON[r]).join(', ')}</td>
                  <td>{f.yield_pct}% <small>(중앙값 {f.line_median_yield_pct}%)</small></td><td>{f.achievement_pct}%</td><td>{f.downtime_min}</td>
                  <td>{f.defect_note || f.downtime_reason}</td>
                </tr>
              ))}
            </tbody>
          </table></div>

          <h4>AI 분석</h4>
          <p className="headline">{data.ai.headline}</p>
          {data.ai.findings.map((f, i) => (
            <div className="card" key={i}>
              <strong>{f.line} · {f.dates}</strong>
              <p>{f.problem}</p>
              <ol>
                {f.hypotheses.map((h, j) => (
                  <li key={j}><b>{h.cause}</b><br /><span className="muted">근거: {h.evidence}</span><br /><span className="muted">확인: {h.how_to_verify}</span></li>
                ))}
              </ol>
            </div>
          ))}

          <div className="row between"><h4>보고서 초안</h4><CopyButton text={data.ai.report_markdown} /></div>
          <pre className="doc">{data.ai.report_markdown}</pre>
          <Disclaimer />
        </div>
      )}
    </section>
  );
}
