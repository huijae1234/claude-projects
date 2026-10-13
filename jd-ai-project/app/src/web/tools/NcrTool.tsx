import { useEffect, useState } from 'react';
import type { NcrResult } from '../../server/application/tools';
import type { NcrMemo } from '../../server/domain/seed';
import { api } from '../api';
import { Badge, CopyButton, Disclaimer, RunStatus, useRun } from '../ui';
import { NCR_PREFILL_EVENT } from './InspectionTool';

const TYPE: Record<NcrResult['nc_type'], string> = {
  foreign_matter: '이물', spec_deviation: '규격 이탈', process_deviation: '공정 이탈', packaging: '포장',
  labeling: '표시', material: '원부자재', other: '기타',
};
const SEVERITY = { critical: ['red', '긴급'], major: ['orange', '중대'], minor: ['yellow', '경미'] } as const;
const DISPOSITION: Record<NcrResult['disposition']['proposal'], string> = {
  hold: '보류', rework: '재작업', scrap: '폐기', conditional_release: '조건부 출하', return_to_supplier: '공급사 반품', undetermined: '미정',
};

export function NcrTool() {
  const [memos, setMemos] = useState<NcrMemo[]>([]);
  const [id, setId] = useState('');
  const [text, setText] = useState('');
  const [listState, setListState] = useState<'loading' | 'ok' | string>('loading');
  const { loading, error, data, run } = useRun<NcrResult>();

  useEffect(() => {
    api<NcrMemo[]>('/api/seed/ncr_memos')
      .then((m) => {
        setMemos(m);
        setId(m[0]?.id ?? '');
        setText(m[0]?.text ?? '');
        setListState('ok');
      })
      .catch((e) => setListState(`샘플 메모 목록을 불러오지 못했습니다: ${e instanceof Error ? e.message : e}. 서버가 켜져 있는지 확인하세요. 아래에 직접 입력해도 됩니다.`));
  }, []);

  // 검사 이상 탐지 탭에서 "부적합 보고서 쓰기"를 누르면 메모가 채워진다
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const t = (e as CustomEvent<{ text: string }>).detail?.text;
      if (t) {
        setId('');
        setText(t);
      }
    };
    window.addEventListener(NCR_PREFILL_EVENT, onPrefill);
    return () => window.removeEventListener(NCR_PREFILL_EVENT, onPrefill);
  }, []);

  const choose = (nextId: string) => {
    setId(nextId);
    const m = memos.find((x) => x.id === nextId);
    if (m) setText(m.text);
  };

  return (
    <section className="tool">
      <h3>부적합 보고서 초안</h3>
      <p className="muted">
        현장 메모를 표준 양식 보고서로 만듭니다. 메모에 없는 정보는 지어내지 않고 되물을 질문으로 돌려주며, AI가 "메모에 이렇게 적혀 있다"고 한 인용은 코드가 원문과 대조합니다.
      </p>
      <div className="row">
        <select value={id} onChange={(e) => choose(e.target.value)} aria-label="샘플 현장 메모 선택">
          {id === '' && <option value="">직접 입력한 메모</option>}
          {memos.map((m) => <option key={m.id} value={m.id}>{m.id} · {m.title}</option>)}
        </select>
      </div>
      {listState === 'loading' && <p className="status">샘플 메모 불러오는 중…</p>}
      {listState !== 'loading' && listState !== 'ok' && <p className="status error" role="alert">{listState}</p>}

      <label className="field">
        <span>현장 메모 <small>(수정하거나 직접 붙여넣을 수 있습니다)</small></span>
        <textarea rows={5} value={text} onChange={(e) => { setText(e.target.value); setId(''); }} placeholder="예) 6/26 야간조 소시지라인 금속검출기 3회 연속 반응. 로트 S0626-02 …" />
      </label>
      <div className="row">
        <button disabled={loading || text.trim().length === 0} onClick={() => run(() => api<NcrResult>('/api/tools/ncr', { text }))}>
          보고서 초안 만들기
        </button>
        <span className="kv">{text.length}자</span>
      </div>
      <RunStatus loading={loading} error={error} />

      {data && (
        <div className="result">
          <h4>보고서 개요</h4>
          <div className="card">
            <strong className="ncr-title">{data.title}</strong>
            <div className="row">
              <Badge tone="blue">{TYPE[data.nc_type]}</Badge>
              <Badge tone={SEVERITY[data.severity][0]}>{SEVERITY[data.severity][1]} (잠정)</Badge>
              <Badge tone="gray">처분 제안: {DISPOSITION[data.disposition.proposal]}</Badge>
              {data.report_to_authority && <Badge tone="orange">기관 보고 검토</Badge>}
            </div>
            <p className="kv">{data.severity_reason}</p>
          </div>

          {data.missing_info.length > 0 && (
            <>
              <h4>현장에 되물을 질문 <small>(메모에 없어서 보고서를 완성할 수 없는 정보)</small></h4>
              <div className="card ask">
                <ol>{data.missing_info.map((q, i) => <li key={i}>{q}</li>)}</ol>
              </div>
            </>
          )}

          <h4>메모에서 확인한 사실 <small>(AI가 인용한 구절을 코드가 메모 원문과 대조)</small></h4>
          <p className={data.unverified_facts === 0 ? 'verify ok' : 'verify warn'} role="status">
            {data.unverified_facts === 0 ? `인용 ${data.facts.length}건 모두 메모 원문과 일치합니다.` : `인용 ${data.facts.length}건 중 ${data.unverified_facts}건이 메모 원문과 다릅니다. 해당 항목을 확인하세요.`}
          </p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>항목</th><th>내용</th><th>메모 원문 인용</th><th>대조</th></tr></thead>
              <tbody>
                {data.facts.map((f, i) => (
                  <tr key={i}>
                    <td>{f.label}</td><td>{f.value}</td>
                    <td className="quote">{f.source_quote}</td>
                    <td><Badge tone={f.verified ? 'green' : 'orange'}>{f.verified ? '원문 일치' : '불일치'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4>영향 범위</h4>
          <p>{data.affected_scope}</p>

          <div className="cols">
            <div>
              <h4>즉시 조치</h4>
              <ul>{data.immediate_actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </div>
            <div>
              <h4>처분 제안 <small>(최종 판정은 품질 책임자)</small></h4>
              <p><Badge tone="gray">{DISPOSITION[data.disposition.proposal]}</Badge></p>
              <p>{data.disposition.reason}</p>
            </div>
          </div>

          <h4>원인 분석 (5Why) <small>(메모에 근거가 없는 단계는 "가정"으로 표시)</small></h4>
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>왜?</th><th>답</th><th>근거</th></tr></thead>
              <tbody>
                {data.five_whys.map((w, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td><td>{w.why}</td><td>{w.answer}</td>
                    <td><Badge tone={w.basis === 'memo' ? 'blue' : 'orange'}>{w.basis === 'memo' ? '메모' : '가정'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="cols">
            <div>
              <h4>시정 조치</h4>
              <ul>{data.corrective_actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </div>
            <div>
              <h4>재발 방지 조치</h4>
              <ul>{data.preventive_actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </div>
          </div>

          <div className="row between"><h4>보고서 본문 (표준 양식 초안)</h4><CopyButton text={data.report_markdown} /></div>
          <pre className="doc">{data.report_markdown}</pre>
          <Disclaimer />
        </div>
      )}
    </section>
  );
}
