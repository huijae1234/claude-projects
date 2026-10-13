import { useEffect, useState } from 'react';
import type { SupplierReportResult, SupplierTone } from '../../server/application/tools';
import type { Supplier, SupplierCase } from '../../server/domain/seed';
import { api } from '../api';
import { Badge, CopyButton, Disclaimer, metaOf, RunStatus, useRun } from '../ui';

const TONES: Array<{ id: SupplierTone; name: string; desc: string }> = [
  { id: 'inform', name: '상황 공유·협조 요청', desc: '협력적인 어조. 확정 전이라 자료 공유와 의견을 구합니다.' },
  { id: 'request_action', name: '원인 조사·시정조치 요청', desc: '정중하지만 분명하게 조사 결과와 조치 계획을 요청합니다.' },
  { id: 'formal_corrective', name: '공식 시정조치 요구', desc: '공식 문서 어조. 기한을 명시하고 대책서 제출을 요구합니다.' },
];
const TONE_NAME = Object.fromEntries(TONES.map((t) => [t.id, t.name])) as Record<SupplierTone, string>;
const GRADE = { A: 'green', B: 'yellow', C: 'red' } as const;

export function SupplierReportTool() {
  const [cases, setCases] = useState<SupplierCase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [caseId, setCaseId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [text, setText] = useState('');
  const [tone, setTone] = useState<SupplierTone>('request_action');
  const [days, setDays] = useState(5);
  const [listState, setListState] = useState<'loading' | 'ok' | string>('loading');
  const { loading, error, cancelled, data, run, cancel } = useRun<SupplierReportResult>();

  useEffect(() => {
    Promise.all([api<SupplierCase[]>('/api/seed/supplier_cases'), api<Supplier[]>('/api/seed/suppliers')])
      .then(([cs, ss]) => {
        setCases(cs);
        setSuppliers(ss);
        const c = cs[0];
        if (c) {
          setCaseId(c.id);
          setSupplierId(c.supplier_id);
          setText(c.text);
        }
        setListState('ok');
      })
      .catch((e) => setListState(`샘플 목록을 불러오지 못했습니다: ${e instanceof Error ? e.message : e}. 서버가 켜져 있는지 확인하세요.`));
  }, []);

  const supplier = suppliers.find((s) => s.id === supplierId);
  const chooseCase = (id: string) => {
    const c = cases.find((x) => x.id === id);
    setCaseId(id);
    if (c) {
      setSupplierId(c.supplier_id);
      setText(c.text);
    }
  };
  const nameOf = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id;

  return (
    <section className="tool">
      <h3>협력업체 통보서 초안</h3>
      <p className="muted">
        품질 이슈를 협력업체에 알리는 공문 초안입니다. 메모의 사실 인용과 업체의 과거 이력은 코드가 원문·기록과 대조하고, 책임을 단정하거나 암시하는 표현은 경고합니다.
      </p>

      <div className="row">
        <select value={caseId} onChange={(e) => chooseCase(e.target.value)} aria-label="샘플 상황 선택">
          {caseId === '' && <option value="">직접 입력한 상황</option>}
          {cases.map((c) => <option key={c.id} value={c.id}>{c.id} · {nameOf(c.supplier_id)} · {c.title}</option>)}
        </select>
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label="협력업체 선택">
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.category})</option>)}
        </select>
      </div>
      {listState === 'loading' && <p className="status">샘플 불러오는 중…</p>}
      {listState !== 'loading' && listState !== 'ok' && <p className="status error" role="alert">{listState}</p>}

      <div className="sup-grid">
        {supplier && (
          <div className="card sup-card">
            <div className="row tight">
              <strong>{supplier.name}</strong>
              <Badge tone={GRADE[supplier.grade]}>등급 {supplier.grade}</Badge>
            </div>
            <p className="kv">{supplier.category} · 납품: {supplier.supplies.join(', ')}</p>
            <p className="kv">수신 담당: {supplier.contact_role} · 최근 감사 {supplier.last_audit}</p>
            <h5>과거 품질 이슈 이력 <small>(공문이 인용할 수 있는 유일한 과거 사례)</small></h5>
            {supplier.history.length === 0 ? (
              <p className="kv">이력 없음</p>
            ) : (
              <ul>{supplier.history.map((h) => <li key={h.id}><b>{h.id}</b>{h.date} · {h.summary}</li>)}</ul>
            )}
          </div>
        )}
        <label className="field">
          <span>상황 메모 <small>(수정하거나 직접 붙여넣을 수 있습니다)</small></span>
          <textarea rows={9} value={text} onChange={(e) => { setText(e.target.value); setCaseId(''); }} placeholder="예) 새봄케이싱 롤 CS-0618 입고. 두께가 고르지 않음. COA는 정상 값으로 와 있음 …" />
        </label>
      </div>

      <fieldset className="tone-fieldset">
        <legend className="field-label">문서 성격</legend>
        <div className="tone-grid" role="radiogroup" aria-label="문서 성격">
          {TONES.map((t) => (
            <label className="tone-opt" key={t.id}>
              <input type="radio" name="supplier-tone" value={t.id} checked={tone === t.id} onChange={() => setTone(t.id)} />
              <b>{t.name}</b>
              <span>{t.desc}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field-row">
        <label className="field">
          <span>회신 기한</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="회신 기한">
            {[3, 5, 7, 10].map((d) => <option key={d} value={d}>접수 후 {d}영업일 이내</option>)}
          </select>
        </label>
        <button disabled={loading || !supplierId || text.trim().length === 0} onClick={() => run((signal) => api<SupplierReportResult>('/api/tools/supplier_report', { supplier_id: supplierId, text, tone, deadline_days: days }, signal))}>
          공문 초안 만들기
        </button>
      </div>
      <RunStatus loading={loading} error={error} cancelled={cancelled} onCancel={cancel} typical="30~50초" />

      {data && <Result data={data} supplierName={supplier?.name ?? ''} />}
    </section>
  );
}

function Result({ data, supplierName }: { data: SupplierReportResult; supplierName: string }) {
  return (
    <div className="result">
      <h4>공문 개요</h4>
      <div className="card">
        <strong className="ncr-title">{data.subject}</strong>
        <div className="row">
          <Badge tone="blue">{supplierName}</Badge>
          <Badge tone="gray">{TONE_NAME[data.tone]}</Badge>
          <Badge tone="gray">회신 기한 접수 후 {data.deadline_days}영업일</Badge>
        </div>
        <p className="kv">{data.summary}</p>
      </div>

      {data.flagged_phrases.length > 0 && (
        <div className="card warn-box" role="alert">
          <h5>책임을 암시하거나 단정하는 표현이 {data.flagged_phrases.length}곳 있습니다. 발송 전에 확인하세요.</h5>
          <ul>
            {data.flagged_phrases.map((f, i) => (
              <li key={i}><mark>{f.phrase}</mark> — <span className="muted">{f.context}</span></li>
            ))}
          </ul>
        </div>
      )}

      {data.internal_checklist.length > 0 && (
        <>
          <h4>발송 전, 우리 쪽에서 먼저 확인할 것</h4>
          <div className="card ask">
            <ul>{data.internal_checklist.map((x, i) => <li key={i}>{x}</li>)}</ul>
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
                <td>{f.label}</td><td>{f.value}</td><td className="quote">{f.source_quote}</td>
                <td><Badge tone={f.verified ? 'green' : 'orange'}>{f.verified ? '원문 일치' : '불일치'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="cols">
        <div>
          <h4>우리 쪽 영향</h4>
          <p>{data.our_impact}</p>
        </div>
        <div>
          <h4>아직 확정되지 않은 것 <small>(공문에서 단정하지 않음)</small></h4>
          <ul>{data.not_yet_confirmed.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      </div>

      <h4>업체에 요청하는 것</h4>
      <div className="table-wrap">
        <table>
          <thead><tr><th>구분</th><th>요청 사항</th><th>회신 기한</th></tr></thead>
          <tbody>
            {data.requests.map((r, i) => (
              <tr key={i}>
                <td><Badge tone={r.priority === 'must' ? 'red' : 'gray'}>{r.priority === 'must' ? '필수' : '권장'}</Badge></td>
                <td>{r.request}</td><td>{r.due}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.materials_requested.length > 0 && (
        <>
          <h4>요청 자료</h4>
          <ul>{data.materials_requested.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </>
      )}

      {(data.history.length > 0 || data.unknown_refs_dropped > 0) && (
        <>
          <h4>인용한 과거 이력 <small>(업체 기록과 대조)</small></h4>
          {data.history.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>이슈 번호</th><th>일자</th><th>내용</th><th>대조</th></tr></thead>
                <tbody>
                  {data.history.map((h) => (
                    <tr key={h.id}><td>{h.id}</td><td>{h.date}</td><td>{h.summary}</td><td><Badge tone="green">업체 기록과 일치</Badge></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.unknown_refs_dropped > 0 && <p className="muted">업체 기록에 없는 이력 {data.unknown_refs_dropped}건은 결과에서 제외했습니다.</p>}
        </>
      )}

      {data.missing_info.length > 0 && (
        <>
          <h4>현장에 되물을 질문 <small>(메모에 없어서 공문에 [확인 필요]로 남긴 정보)</small></h4>
          <div className="card ask"><ol>{data.missing_info.map((q, i) => <li key={i}>{q}</li>)}</ol></div>
        </>
      )}

      <div className="row between"><h4>공문 본문 (초안)</h4><CopyButton text={data.letter_markdown} /></div>
      <pre className="doc">{data.letter_markdown}</pre>
      <Disclaimer meta={metaOf(data)} />
    </div>
  );
}
