import { useEffect, useState } from 'react';
import type { RegulationResult } from '../../server/application/tools';
import type { Regulation } from '../../server/domain/seed';
import { api } from '../api';
import { Badge, Disclaimer, RunStatus, useRun } from '../ui';

const LEVEL = { high: ['red', '영향 큼'], medium: ['orange', '영향 보통'], low: ['yellow', '영향 낮음'], none: ['green', '영향 없음'] } as const;
const ORDER = { high: 0, medium: 1, low: 2, none: 3 } as const;

export function RegulationTool() {
  const [regs, setRegs] = useState<Regulation[]>([]);
  const [id, setId] = useState('');
  const [listState, setListState] = useState<'loading' | 'ok' | string>('loading');
  const { loading, error, data, run } = useRun<RegulationResult>();

  useEffect(() => {
    api<Regulation[]>('/api/seed/regulations')
      .then((r) => {
        setRegs(r);
        setId(r[0]?.id ?? '');
        setListState('ok');
      })
      .catch((e) => setListState(`개정 고시 목록을 불러오지 못했습니다: ${e instanceof Error ? e.message : e}. 서버가 켜져 있는지 확인하세요.`));
  }, []);
  const reg = regs.find((r) => r.id === id);

  return (
    <section className="tool">
      <h3>법규 개정 영향도 분석</h3>
      <p className="muted">입력된 조문 범위 안에서만 판단하고, AI가 인용한 문장은 코드가 원문과 대조합니다.</p>
      <div className="row">
        <select value={id} onChange={(e) => setId(e.target.value)} aria-label="개정 고시 선택">
          {regs.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
        <button disabled={loading || !id} onClick={() => run(() => api<RegulationResult>('/api/tools/regulation', { regulation_id: id }))}>
          영향도 분석
        </button>
      </div>
      {listState === 'loading' && <p className="status">개정 고시 목록 불러오는 중…</p>}
      {listState !== 'loading' && listState !== 'ok' && <p className="status error" role="alert">{listState}</p>}
      {reg && (
        <div className="card">
          <small className="muted">{reg.notice} · 시행일 {reg.effective_date}</small>
          {reg.articles.map((a) => <p key={a.no}><b>{a.no}</b> {a.text}</p>)}
        </div>
      )}
      <RunStatus loading={loading} error={error} />

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
                <Badge tone={i.citation_verified ? 'blue' : 'orange'}>{i.citation_verified ? '인용문 원문 일치' : '인용문 불일치 · 확인 필요'}</Badge>
              </div>
              <blockquote>{i.article_no}: {i.quoted_text}</blockquote>
              <p>{i.reason}</p>
              {i.actions.length > 0 && <ul>{i.actions.map((a, j) => <li key={j}>{a}</li>)}</ul>}
            </div>
          ))}
          {data.unknown_products_dropped > 0 && <p className="muted">존재하지 않는 품목 {data.unknown_products_dropped}건은 결과에서 제외했습니다.</p>}
          {data.general_actions.length > 0 && (<><h4>공통 조치</h4><ul>{data.general_actions.map((a, j) => <li key={j}>{a}</li>)}</ul></>)}
          <Disclaimer />
        </div>
      )}
    </section>
  );
}
