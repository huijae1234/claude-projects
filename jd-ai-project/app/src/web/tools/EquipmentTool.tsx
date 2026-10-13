import { useState } from 'react';
import type { EquipmentResult } from '../../server/application/tools';
import type { EquipmentAnalysis, MachineAnalysis, MetricFlag, Risk } from '../../server/domain/equipment';
import { api } from '../api';
import { AiWait, Badge, CopyButton, CsvPicker, Disclaimer, metaOf, RunStatus, usePreviewRun } from '../ui';

const RISK: Record<Risk, ['red' | 'orange' | 'green', string]> = { high: ['red', '위험 높음'], medium: ['orange', '주의'], low: ['green', '정상'] };
const URGENCY = { immediate: ['red', '즉시'], within_week: ['orange', '1주 내'], next_pm: ['gray', '다음 정기정비'] } as const;
const METRIC: Record<string, string> = {
  motor_temp_c: '모터 온도', bearing_temp_c: '베어링 온도', vibration_mms: '진동', motor_current_a: '모터 전류',
  process_pressure_bar: '공정 압력', process_temp_c: '공정 온도',
};

const flagText = (f: MetricFlag) =>
  f.kind === 'drift'
    ? `${METRIC[f.metric] ?? f.metric} ${f.pct_change > 0 ? '+' : ''}${f.pct_change}% (z=${f.z})`
    : `${METRIC[f.metric] ?? f.metric} 변동폭 ${f.spread_ratio}배`;

export function EquipmentTool() {
  const [csv, setCsv] = useState('');
  const { preview, full, loading, error, cancelled, start, cancel } = usePreviewRun<{ analysis: EquipmentAnalysis }, EquipmentResult>();
  const analysis = full?.analysis ?? preview?.analysis; // 코드 계산 결과는 먼저 보여준다
  const ai = full?.ai;
  const aiBy = new Map(ai?.assessments.map((a) => [a.machine_id, a]));

  return (
    <section className="tool">
      <h3>설비 이상 진단</h3>
      <p className="muted">
        기준선 대비 이탈과 고장 전조는 코드가 계산하고, 예상 고장 유형·정비 계획·경보 기준 제안은 AI가 만듭니다.
      </p>
      <CsvPicker
        tool="equipment"
        requiredHint="date, machine_id, machine_name, load_pct, motor_temp_c, bearing_temp_c, vibration_mms, motor_current_a, downtime_min, breakdown_flag (선택: area, process_pressure_bar, process_temp_c, wear_index, wo_type, note)"
        onChange={(c) => setCsv(c)}
      />
      <div className="row">
        <button
          disabled={loading || !csv}
          onClick={() =>
            start(
              (signal) => api<{ analysis: EquipmentAnalysis }>('/api/tools/equipment/preview', { csv }, signal),
              (signal) => api<EquipmentResult>('/api/tools/equipment', { csv }, signal),
            )
          }
        >
          진단하기
        </button>
      </div>
      <RunStatus loading={loading} error={error} cancelled={cancelled} onCancel={cancel} typical="25~70초" what="AI가 해석 중입니다" />

      {analysis && (
        <div className="result">
          <h4>AI 요약</h4>
          {ai ? <p className="headline">{ai.headline}</p> : loading && <AiWait />}

          <h4>설비별 현황 <small>(코드 계산 · 위험도순)</small></h4>
          <div className="risk-grid">
            {analysis.machines.map((m) => (
              <div className={`card risk-${m.risk}`} key={m.machine_id}>
                <div className="row"><strong>{m.machine_id}</strong><Badge tone={RISK[m.risk][0]}>{RISK[m.risk][1]}</Badge></div>
                <p className="kv">{m.machine_name} · {m.area}</p>
                <p className="kv">고장 {m.breakdowns.length}건 · 정지 합계 {m.total_downtime_min}분</p>
                {m.risk_reasons.map((r) => <p className="kv" key={r}>• {r}</p>)}
              </div>
            ))}
          </div>

          <h4>주의 설비 상세</h4>
          {analysis.machines.filter((m) => m.risk !== 'low' || m.breakdowns.length > 0).map((m) => (
            <MachineDetail key={m.machine_id} m={m} ai={aiBy.get(m.machine_id)} />
          ))}
          {full && full.unknown_machines_dropped > 0 && <p className="muted">존재하지 않는 설비 {full.unknown_machines_dropped}건은 결과에서 제외했습니다.</p>}

          {ai && (
            <>
              <h4>조기 경보 기준 제안 <small>(과거 고장 전조에서 도출)</small></h4>
              <div className="table-wrap"><table>
                <thead><tr><th>설비 유형</th><th>지표</th><th>제안 기준</th><th>근거</th></tr></thead>
                <tbody>
                  {ai.alarm_rules.map((r, i) => (
                    <tr key={i}><td>{r.machine_type}</td><td>{METRIC[r.metric] ?? r.metric}</td><td>{r.rule}</td><td>{r.rationale}</td></tr>
                  ))}
                </tbody>
              </table></div>

              <div className="row between"><h4>이번 주 예방정비 계획</h4><CopyButton text={ai.pm_plan_markdown} /></div>
              <pre className="doc">{ai.pm_plan_markdown}</pre>
              <Disclaimer meta={metaOf(full)} />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function MachineDetail({ m, ai }: { m: MachineAnalysis; ai?: EquipmentResult['ai']['assessments'][number] }) {
  return (
    <div className="card">
      <div className="row">
        <strong>{m.machine_id} {m.machine_name}</strong>
        <Badge tone={RISK[m.risk][0]}>{RISK[m.risk][1]}</Badge>
      </div>
      {m.current_flags.length > 0 && <p className="kv">현재 이탈(최근 {m.window_days}일 vs 정상 기준 {m.baseline_days}일): {m.current_flags.map(flagText).join(' · ')}</p>}
      {m.breakdowns.map((b) => (
        <div key={b.date} className="kv">
          <b>과거 고장 {b.date}</b> ({b.downtime_min}분 정지) {b.note}
          <br />고장 직전 전조: {b.precursors.length ? b.precursors.map(flagText).join(' · ') : '뚜렷한 전조 없음 (돌발 고장)'}
        </div>
      ))}
      {ai && (
        <>
          <p><b>예상 고장 유형(추정):</b> {ai.probable_failure_mode}</p>
          {ai.evidence.length > 0 && <ul>{ai.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          {ai.actions.length > 0 && (
            <ul>
              {ai.actions.map((a, i) => (
                <li key={i}><Badge tone={URGENCY[a.urgency][0]}>{URGENCY[a.urgency][1]}</Badge> {a.action} <span className="muted">· {a.owner}</span></li>
              ))}
            </ul>
          )}
          {ai.spare_parts.length > 0 && <p className="kv">확보할 부품: {ai.spare_parts.join(', ')}</p>}
        </>
      )}
    </div>
  );
}
