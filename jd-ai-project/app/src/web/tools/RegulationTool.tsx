import { useEffect, useMemo, useState } from 'react';
import type { RegulationResult } from '../../server/application/tools';
import { parseRegulationText } from '../../server/domain/regulation';
import type { Regulation } from '../../server/domain/seed';
import { api } from '../api';
import { REGULATION_EXAMPLE, REGULATION_EXAMPLE_TITLE } from '../examples';
import { Badge, Disclaimer, metaOf, RunStatus, useRun } from '../ui';

const LEVEL = { high: ['red', '영향 큼'], medium: ['orange', '영향 보통'], low: ['yellow', '영향 낮음'], none: ['green', '영향 없음'] } as const;
const ORDER = { high: 0, medium: 1, low: 2, none: 3 } as const;

const EXAMPLE = REGULATION_EXAMPLE;

export function RegulationTool() {
  const [regs, setRegs] = useState<Regulation[]>([]);
  const [id, setId] = useState('');
  const [mode, setMode] = useState<'sample' | 'paste'>('sample');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [text, setText] = useState('');
  const [listState, setListState] = useState<'loading' | 'ok' | string>('loading');
  const { loading, error, cancelled, data, run, cancel } = useRun<RegulationResult>();

  useEffect(() => {
    api<Regulation[]>('/api/seed/regulations')
      .then((r) => {
        setRegs(r);
        setId(r[0]?.id ?? '');
        setListState('ok');
      })
      .catch((e) => setListState(`개정 고시 목록을 불러오지 못했습니다: ${e instanceof Error ? e.message : e}. 서버가 켜져 있는지 확인하세요.`));
  }, []);

  // 붙여넣은 조문은 서버와 같은 규칙으로 화면에서 미리 나눠 보여준다
  const parsed = useMemo(() => {
    if (mode !== 'paste' || text.trim() === '') return null;
    try {
      return { ok: true as const, reg: parseRegulationText({ title, effective_date: date, text }) };
    } catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : String(e) };
    }
  }, [mode, title, date, text]);
  const reg = mode === 'sample' ? regs.find((r) => r.id === id) : parsed?.ok ? parsed.reg : undefined;
  const canRun = mode === 'sample' ? !!id : !!parsed?.ok;
  const body = mode === 'sample' ? { regulation_id: id } : { custom: { title, effective_date: date || undefined, text } };

  return (
    <section className="tool">
      <h3>법규 개정 영향도 분석</h3>
      <p className="muted">입력된 조문 범위 안에서만 판단하고, AI가 인용한 문장은 코드가 원문과 대조합니다.</p>

      <div className="seg inline" role="radiogroup" aria-label="조문 입력 방식">
        <button role="radio" aria-checked={mode === 'sample'} className={mode === 'sample' ? 'seg-btn active' : 'seg-btn'} onClick={() => setMode('sample')}>샘플 고시 고르기</button>
        <button role="radio" aria-checked={mode === 'paste'} className={mode === 'paste' ? 'seg-btn active' : 'seg-btn'} onClick={() => setMode('paste')}>조문 직접 붙여넣기</button>
      </div>

      {mode === 'sample' ? (
        <div className="row">
          <select value={id} onChange={(e) => setId(e.target.value)} aria-label="개정 고시 선택">
            {regs.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </div>
      ) : (
        <div className="paste-box">
          <div className="field-row">
            <label className="field grow">
              <span>고시 제목 <small>(선택)</small></span>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예) 면류 나트륨 기준 개정 고시" maxLength={200} />
            </label>
            <label className="field">
              <span>시행일 <small>(선택)</small></span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>조문 <small>(식품의약품안전처 고시 등에서 복사해 붙여넣기 · &quot;제1조&quot; 단위로 자동으로 나눕니다)</small></span>
            <textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} />
          </label>
          <div className="row tight">
            {text === '' && <button className="ghost mini" onClick={() => { setText(EXAMPLE); setTitle(REGULATION_EXAMPLE_TITLE); }}>예시 넣어 보기</button>}
            <span className="kv">{text.length.toLocaleString()} / 20,000자</span>
          </div>
          {parsed && !parsed.ok && <p className="status error" role="alert">{parsed.message}</p>}
        </div>
      )}

      {listState === 'loading' && mode === 'sample' && <p className="status">개정 고시 목록 불러오는 중…</p>}
      {listState !== 'loading' && listState !== 'ok' && mode === 'sample' && <p className="status error" role="alert">{listState}</p>}
      {reg && (
        <div className="card">
          <small className="muted">
            {reg.notice} · 시행일 {reg.effective_date}
            {mode === 'paste' && ` · ${reg.articles.length}개 조로 나눔`}
          </small>
          {reg.articles.map((a) => <p key={a.no}><b>{a.no}</b> {a.text}</p>)}
        </div>
      )}
      <div className="row">
        <button disabled={loading || !canRun} onClick={() => run((signal) => api<RegulationResult>('/api/tools/regulation', body, signal))}>
          영향도 분석
        </button>
      </div>
      <RunStatus loading={loading} error={error} cancelled={cancelled} onCancel={cancel} typical="15~30초" />

      {data && (
        <div className="result">
          <h4>요약</h4>
          <p>{data.summary}</p>
          <h4>품목별 영향</h4>
          {[...data.impacts].sort((a, b) => ORDER[a.level] - ORDER[b.level]).map((i, k) => (
            <div className="card" key={k}>
              <div className="row">
                <strong>{i.product_id}</strong>
                <Badge tone={LEVEL[i.level][0]}>{LEVEL[i.level][1]}</Badge>
                {i.citation_verified === null ? <Badge tone="gray">인용 없음 (영향 없음)</Badge> : <Badge tone={i.citation_verified ? 'blue' : 'orange'}>{i.citation_verified ? '인용문 원문 일치' : '인용문 불일치 · 확인 필요'}</Badge>}
              </div>
              {i.quoted_text.trim() !== '' && <blockquote>{i.article_no}: {i.quoted_text}</blockquote>}
              <p>{i.reason}</p>
              {i.actions.length > 0 && <ul>{i.actions.map((a, j) => <li key={j}>{a}</li>)}</ul>}
            </div>
          ))}
          {data.unknown_products_dropped > 0 && <p className="muted">존재하지 않는 품목 {data.unknown_products_dropped}건은 결과에서 제외했습니다.</p>}
          {data.general_actions.length > 0 && (<><h4>공통 조치</h4><ul>{data.general_actions.map((a, j) => <li key={j}>{a}</li>)}</ul></>)}
          <Disclaimer meta={metaOf(data)} />
        </div>
      )}
    </section>
  );
}
