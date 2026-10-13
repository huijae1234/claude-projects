import { useEffect, useState } from 'react';
import type { ClaimAi } from '../../server/application/tools';
import type { Claim } from '../../server/domain/seed';
import { api } from '../api';
import { Badge, CopyButton, Disclaimer, RunStatus, useRun } from '../ui';

const SEVERITY = { critical: ['red', '긴급'], major: ['orange', '중대'], minor: ['yellow', '경미'], inquiry: ['gray', '단순 문의·의견'] } as const;
const CATEGORY: Record<ClaimAi['category'], string> = {
  foreign_matter: '이물', allergen: '알레르기', packaging: '포장 불량', labeling: '표시 오류',
  quantity: '내용량', taste_odor: '맛·냄새', spoilage: '변질', other: '기타',
};

export function ClaimTool() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [id, setId] = useState('');
  const [custom, setCustom] = useState('');
  const [listState, setListState] = useState<'loading' | 'ok' | string>('loading');
  const { loading, error, data, run } = useRun<ClaimAi>();

  useEffect(() => {
    api<Claim[]>('/api/seed/claims')
      .then((c) => {
        setClaims(c);
        setId(c[0]?.id ?? '');
        setListState('ok');
      })
      .catch((e) => setListState(`샘플 클레임 목록을 불러오지 못했습니다: ${e instanceof Error ? e.message : e}. 서버가 켜져 있는지 확인하세요. 아래에 직접 붙여넣어도 됩니다.`));
  }, []);
  const claim = claims.find((c) => c.id === id);
  const useCustom = custom.trim().length > 0;

  return (
    <section className="tool">
      <h3>클레임 분류·회신 초안</h3>
      <p className="muted">샘플 클레임을 고르거나 직접 붙여넣으세요. 직접 입력이 있으면 그것을 우선합니다.</p>
      <div className="row">
        <select value={id} onChange={(e) => setId(e.target.value)} aria-label="샘플 클레임 선택">
          {claims.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.product_id} · {c.title ?? `${c.text.slice(0, 20)}…`}</option>)}
        </select>
      </div>
      {listState === 'loading' && <p className="status">샘플 클레임 불러오는 중…</p>}
      {listState !== 'loading' && listState !== 'ok' && <p className="status error" role="alert">{listState}</p>}
      {claim && !useCustom && <div className="card"><small className="muted">{claim.channel} · {claim.received_at} · 로트 {claim.lot}</small><p>{claim.text}</p></div>}
      <textarea rows={3} placeholder="(선택) 클레임 내용을 직접 붙여넣기" value={custom} onChange={(e) => setCustom(e.target.value)} />
      <div className="row">
        <button
          disabled={loading || (!useCustom && !id)}
          onClick={() => run(() => api<ClaimAi>('/api/tools/claim', useCustom ? { text: custom } : { claim_id: id }))}
        >
          분류하고 회신 초안 만들기
        </button>
      </div>
      <RunStatus loading={loading} error={error} />

      {data && (
        <div className="result">
          <div className="row">
            <Badge tone={SEVERITY[data.severity][0]}>{SEVERITY[data.severity][1]}</Badge>
            <Badge tone="blue">{CATEGORY[data.category]}</Badge>
            {!data.is_claim && <Badge tone="gray">불만 아님</Badge>}
            {data.health_risk && <Badge tone="red">건강 위해 가능성</Badge>}
            {data.report_to_authority && <Badge tone="orange">기관 보고 검토</Badge>}
          </div>
          <p>{data.severity_reason}</p>
          <div className="cols">
            <div><h4>즉시 조치</h4><ul>{data.immediate_actions.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
            <div><h4>원인 조사 항목</h4><ul>{data.investigation_items.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
          </div>
          <div className="row between"><h4>고객 회신 초안</h4><CopyButton text={data.reply_draft} /></div>
          <pre className="doc">{data.reply_draft}</pre>
          <Disclaimer />
        </div>
      )}
    </section>
  );
}
