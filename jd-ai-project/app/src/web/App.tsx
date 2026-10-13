import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import './styles.css';
import { api } from './api';
import { ArrowRight, BrandMark, RoleIcon } from './icons';
import { ROLES, type Role, type RoleId, type ToolId } from './roles';
import { ClaimTool } from './tools/ClaimTool';
import { EquipmentTool } from './tools/EquipmentTool';
import { InspectionTool, NCR_PREFILL_EVENT } from './tools/InspectionTool';
import { NcrTool } from './tools/NcrTool';
import { ProductionTool } from './tools/ProductionTool';
import { RegulationTool } from './tools/RegulationTool';
import { SupplierReportTool } from './tools/SupplierReportTool';

type View = 'all' | RoleId;

const TOOL: Record<ToolId, () => React.JSX.Element> = {
  production: ProductionTool,
  equipment: EquipmentTool,
  inspection: InspectionTool,
  ncr: NcrTool,
  regulation: RegulationTool,
  claim: ClaimTool,
  supplier: SupplierReportTool,
};

function readHash(): View {
  const h = window.location.hash.replace('#', '');
  return ROLES.some((r) => r.id === h) ? (h as RoleId) : 'all';
}

export function App() {
  const [view, setView] = useState<View>(readHash);
  const [mode, setMode] = useState<string>('');

  useEffect(() => {
    const onHash = () => setView(readHash());
    window.addEventListener('hashchange', onHash);
    api<{ mode: string }>('/api/health').then((h) => setMode(h.mode)).catch(() => setMode('offline'));
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (v: View) => {
    window.location.hash = v === 'all' ? '' : v;
    setView(v);
    window.scrollTo({ top: 0 });
  };
  const role = ROLES.find((r) => r.id === view);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="container topbar-in">
          <button className="brand" onClick={() => go('all')} aria-label="처음 화면으로">
            <span className="brand-mark"><BrandMark /></span>
            <span className="brand-text">
              <strong>식품 제조 AI 워크벤치</strong>
              <small>생산 · 품질 업무 보조</small>
            </span>
          </button>
          <nav className="seg" aria-label="직무 선택">
            <button className={view === 'all' ? 'seg-btn active' : 'seg-btn'} aria-pressed={view === 'all'} onClick={() => go('all')}>전체</button>
            {ROLES.map((r) => (
              <button key={r.id} className={view === r.id ? 'seg-btn active' : 'seg-btn'} aria-pressed={view === r.id} onClick={() => go(r.id)}>{r.name}</button>
            ))}
          </nav>
        </div>
      </header>

      <div className="container">
        {mode === 'demo' && <div className="banner demo">데모 모드: 미리 준비된 가짜 응답을 보여줍니다. 실제 Claude 분석이 아닙니다.</div>}
        {mode === 'offline' && <div className="banner error">서버에 연결할 수 없습니다. npm run dev:server 를 실행했는지 확인하세요.</div>}
        <main>{role ? <RoleView key={role.id} role={role} onBack={() => go('all')} /> : <Overview onPick={go} />}</main>
      </div>

      <footer className="container footer">가상의 식품회사 데이터로 만든 시연용 서비스입니다 · 로컬 Claude 인증 사용 · AI 결과는 초안이며 최종 판단은 담당자가 합니다</footer>
    </div>
  );
}

function Overview({ onPick }: { onPick: (id: RoleId) => void }) {
  return (
    <>
      <section className="intro">
        <h2>직무를 고르면, 그 직무의 문제와 AI 도구만 남습니다</h2>
        <p>생산기술 · 품질관리 · 품질보증의 업무를 나누어 보고, 반복되고 수작업이 많은 지점에 AI를 붙였습니다. 숫자 계산과 검증은 코드가, 해석과 초안은 AI가, 판단은 사람이 맡습니다.</p>
      </section>
      <div className="grid">
        {ROLES.map((r) => (
          <article className="role-card" key={r.id}>
            <div className="role-card-head">
              <span className="icon-bubble"><RoleIcon id={r.id} size={22} /></span>
              <div>
                <h3>{r.name}</h3>
                <p className="muted">{r.where}</p>
              </div>
            </div>
            <p className="role-mission">{r.mission}</p>
            <h4 className="eyebrow">주요 업무</h4>
            <ul className="pills">{r.flow.map((f) => <li key={f.name} className={f.tool ? 'pill ai' : 'pill'}>{f.name}</li>)}</ul>
            <h4 className="eyebrow">AI 도구</h4>
            <ul className="tool-list">
              {r.tools.map((t) => (
                <li key={t.id}><b>{t.name}</b><span>{t.desc}</span></li>
              ))}
            </ul>
            <button className="primary block" onClick={() => onPick(r.id)}>{r.name}(으)로 좁히기 <ArrowRight /></button>
          </article>
        ))}
      </div>
    </>
  );
}

function RoleView({ role, onBack }: { role: Role; onBack: () => void }) {
  const [toolId, setToolId] = useState<ToolId>(role.tools[0]!.id);
  const active = role.tools.find((t) => t.id === toolId) ?? role.tools[0]!;
  const toolRef = useRef<HTMLDivElement>(null);

  const stats = [
    { n: role.flow.length, label: '업무 단계' },
    { n: role.flow.filter((f) => f.tool).length, label: 'AI가 돕는 단계' },
    { n: role.problems.length, label: '개선 과제' },
    { n: role.tools.length, label: 'AI 도구' },
  ];

  const openTool = (id: ToolId) => {
    setToolId(id);
    toolRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // 검사 이상 탐지에서 "부적합 보고서 쓰기"를 누르면 보고서 탭으로 이동한다
  useEffect(() => {
    if (!role.tools.some((t) => t.id === 'ncr')) return;
    const go = () => openTool('ncr');
    window.addEventListener(NCR_PREFILL_EVENT, go);
    return () => window.removeEventListener(NCR_PREFILL_EVENT, go);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role.id]);

  return (
    <>
      <button className="back" onClick={onBack}>← 전체 보기</button>

      <section className="hero">
        <div className="hero-main">
          <span className="icon-bubble lg"><RoleIcon id={role.id} size={26} /></span>
          <div>
            <h2 className="role-title">{role.name}</h2>
            <p className="muted">{role.where}</p>
            <p className="hero-lead">{role.mission}</p>
          </div>
        </div>
        <dl className="stats">
          {stats.map((s) => (
            <div key={s.label}><dd>{s.n}</dd><dt>{s.label}</dt></div>
          ))}
        </dl>
      </section>

      <section className="panel" aria-labelledby="flow-h">
        <header className="panel-head">
          <h3 id="flow-h">업무 흐름</h3>
          <span className="muted">AI 표시가 있는 단계를 누르면 해당 도구로 이동합니다</span>
        </header>
        <ol className="stepper">
          {role.flow.map((f, i) => (
            <li key={f.name} className={f.tool ? 'step has-tool' : 'step'}>
              {f.tool ? (
                <button className="step-btn" onClick={() => openTool(f.tool!)}>
                  <StepBody i={i} f={f} />
                </button>
              ) : (
                <div className="step-btn static"><StepBody i={i} f={f} /></div>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="panel" aria-labelledby="prob-h">
        <header className="panel-head">
          <h3 id="prob-h">문제 → AI 개선</h3>
        </header>
        <div className="problems">
          {role.problems.map((p) => (
            <div className="pair" key={p.problem}>
              <div className="pair-side bad"><span className="tag">문제</span><p>{p.problem}</p></div>
              <div className="pair-arrow" aria-hidden="true"><ArrowRight /></div>
              <div className="pair-side good"><span className="tag">AI 개선</span><p>{p.ai}</p></div>
            </div>
          ))}
        </div>
        <div className="division">
          <div><b>코드</b><span>{role.split.code}</span></div>
          <div><b>AI</b><span>{role.split.ai}</span></div>
          <div><b>사람</b><span>{role.split.human}</span></div>
        </div>
      </section>

      <div ref={toolRef} className="tool-col">
        {role.tools.length > 1 && (
          <div className="utabs" role="tablist" aria-label="도구 선택">
            {role.tools.map((t) => (
              <button key={t.id} role="tab" aria-selected={t.id === active.id} className={t.id === active.id ? 'utab active' : 'utab'} onClick={() => setToolId(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
        )}
        {/* 모든 도구를 계속 띄워 두고 숨기기만 한다 → 탭을 바꿔도 선택과 결과가 사라지지 않는다 */}
        {role.tools.map((t) => {
          const Tool = TOOL[t.id];
          return (
            <div key={t.id} hidden={t.id !== active.id}>
              <Tool />
            </div>
          );
        })}
      </div>
    </>
  );
}

function StepBody({ i, f }: { i: number; f: Role['flow'][number] }) {
  return (
    <>
      <span className="step-top">
        <span className="step-no">{i + 1}</span>
        {f.tool && <em className="ai-badge">AI</em>}
      </span>
      <span className="step-name">{f.name}</span>
      <span className="step-desc">{f.desc}</span>
    </>
  );
}
