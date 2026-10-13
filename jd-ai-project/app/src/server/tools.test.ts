import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { FakeLlmClient } from './infra/llm/FakeLlmClient';
import { ErrorCode, err } from '../shared/result';

const post = (app: ReturnType<typeof createApp>, url: string, body: unknown) =>
  app.request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const make = (responses: unknown[]) => {
  const llm = new FakeLlmClient(responses);
  return { llm, app: createApp({ llm, seedDir: 'seed' }) };
};

describe('POST /api/tools/production', () => {
  const ai = {
    headline: 'B라인 수율 하락',
    findings: [
      {
        line: 'B라인',
        dates: '9/14~16',
        problem: '수율 하락',
        hypotheses: [{ cause: '실링 불량', evidence: '비고', how_to_verify: '실링바 점검' }],
      },
    ],
    report_markdown: '# 보고서',
  };

  it('통계는 코드가 계산하고 AI 결과와 함께 돌려준다', async () => {
    const { app, llm } = make([ai]);
    const res = await post(app, '/api/tools/production', {});
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.stats.flagged).toHaveLength(5);
    expect(json.ai.headline).toBe('B라인 수율 하락');
    // 프롬프트에 코드가 계산한 이상치가 들어갔는지
    expect(llm.calls[0]!.prompt).toContain('2026-09-22');
    expect(llm.calls[0]!.prompt).toContain('모터');
  });

  it('잘못된 CSV는 400', async () => {
    const { app } = make([]);
    const res = await post(app, '/api/tools/production', { csv: 'a,b\n1,2' });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(ErrorCode.Validation);
  });

  it('LLM 호출 실패는 502로 전달한다', async () => {
    const { app } = make([err(ErrorCode.LlmCallFailed, 'Not logged in')]);
    const res = await post(app, '/api/tools/production', {});
    expect(res.status).toBe(502);
    expect((await res.json()).error.message).toContain('Not logged in');
  });
});

describe('POST /api/tools/production — CSV 오류 안내', () => {
  it('다른 형식의 CSV면 필요한 컬럼을 알려준다', async () => {
    const { app } = make([]);
    const res = await post(app, '/api/tools/production', { csv: 'transaction_date,asset_tag\n2022-01-03,AST-1' });
    expect(res.status).toBe(400);
    const msg = (await res.json()).error.message;
    expect(msg).toContain('필요한 컬럼');
    expect(msg).toContain('planned_qty');
    expect(msg).toContain('asset_tag');
  });

  it('너무 큰 파일은 거절한다', async () => {
    const { app } = make([]);
    const res = await post(app, '/api/tools/production', { csv: 'x'.repeat(8_000_001) });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain('너무 큽니다');
  });
});

describe('POST /api/tools/equipment', () => {
  const ai = {
    headline: 'TUM-01 베어링 과열이 가장 시급',
    assessments: [
      {
        machine_id: 'TUM-01',
        probable_failure_mode: '베어링 윤활 불량 또는 마모(추정)',
        evidence: ['bearing_temp_c +18%'],
        actions: [{ action: '베어링 윤활 상태 점검', urgency: 'immediate', owner: '설비팀' }],
        spare_parts: ['베어링 세트'],
      },
      { machine_id: 'GHOST-9', probable_failure_mode: 'x', evidence: [], actions: [], spare_parts: [] },
    ],
    alarm_rules: [{ machine_type: '균질기', metric: 'vibration_mms', rule: '7일 평균 +3σ', rationale: '고장 14일 전부터 상승' }],
    pm_plan_markdown: '# 계획',
  };

  it('샘플 데이터를 코드로 분석하고 AI 결과와 합친다', async () => {
    const { app, llm } = make([ai]);
    const res = await post(app, '/api/tools/equipment', {});
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.analysis.machines).toHaveLength(8);
    expect(json.analysis.machines[0].machine_id).toBe('TUM-01');
    expect(json.analysis.machines[0].risk).toBe('high');
    // 없는 설비 id는 버린다
    expect(json.ai.assessments).toHaveLength(1);
    expect(json.unknown_machines_dropped).toBe(1);
    // 프롬프트에 코드가 계산한 분석이 들어갔고, 원본 행은 들어가지 않았다
    expect(llm.calls[0]!.prompt).toContain('2026-06-11');
    expect(llm.calls[0]!.prompt.length).toBeLessThan(20000);
  });

  it('다른 형식 CSV는 필요한 컬럼을 안내한다 (LLM 호출 없음)', async () => {
    const { app, llm } = make([]);
    const res = await post(app, '/api/tools/equipment', { csv: 'transaction_date,asset_tag,temp_bearing_degC\n2022-01-03,AST-1041,63.3' });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/없는 컬럼: .*machine_id/);
    expect(llm.calls).toHaveLength(0);
  });

  it('LLM 실패는 502', async () => {
    const { app } = make([err(ErrorCode.LlmCallFailed, 'Not logged in')]);
    expect((await post(app, '/api/tools/equipment', {})).status).toBe(502);
  });
});

describe('GET /api/samples', () => {
  it('샘플 목록과 내용을 내려주고, 목록에 없는 파일명은 거절한다', async () => {
    const { app } = make([]);
    const list = await (await app.request('/api/samples')).json();
    expect(list.map((s: { name: string }) => s.name).sort()).toEqual([
      'equipment_dairy_meat.csv',
      'inspection_dairy_meat.csv',
      'production_dairy_meat.csv',
    ]);
    const csv = await (await app.request('/api/samples/equipment_dairy_meat.csv')).text();
    expect(csv.split('\n')[0]).toContain('machine_id');
    expect((await app.request('/api/samples/..%2Fseed%2Fclaims.json')).status).toBe(404);
    expect((await app.request('/api/samples/other.csv')).status).toBe(404);
  });
});

describe('POST /api/tools/inspection', () => {
  const ai = {
    headline: '햄 중량이 규격 하한 미달, 가장 먼저 조치 필요',
    assessments: [
      {
        series_key: '햄|중량',
        interpretation: '6/20부터 평균이 내려가 규격 하한 아래로 내려갔습니다.',
        probable_causes: ['충진량 설정 변동(추정)'],
        actions: [{ action: '충진기 설정값 확인', urgency: 'immediate', owner: '생산기술팀' }],
        needs_ncr: true,
      },
      { series_key: '없는|항목', interpretation: 'x', probable_causes: [], actions: [], needs_ncr: false },
    ],
    monitoring_suggestions: [{ target: '햄 중량', suggestion: '2시간마다 측정' }],
  };

  const KEYS = ['햄|중량', '발효유|pH', '소시지|수분', '소시지|염도', '우유|산도'];
  const complete = {
    ...ai,
    assessments: [...KEYS.map((k) => ({ ...ai.assessments[0]!, series_key: k })), ai.assessments[1]!],
  };

  it('샘플을 코드로 분석하고(관리도·Cpk) AI 해석과 합친다', async () => {
    const { app, llm } = make([complete]);
    const res = await post(app, '/api/tools/inspection', {});
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.analysis.series).toHaveLength(6);
    expect(json.analysis.series[0].key).toBe('햄|중량');
    expect(json.analysis.series[0].risk).toBe('high');
    expect(json.analysis.series[0].points.length).toBe(91); // 화면 차트용 점 데이터는 응답에 포함
    expect(json.ai.assessments).toHaveLength(5); // 존재하지 않는 항목('없는|항목')은 버린다
    expect(json.unknown_series_dropped).toBe(1);
    // AI에는 점 데이터를 넘기지 않고 요약만 넘긴다
    const prompt = llm.calls[0]!.prompt;
    expect(prompt).toContain('햄|중량');
    expect(prompt).not.toContain('"points"');
    expect(prompt.length).toBeLessThan(20000);
  });

  it('다른 형식 CSV는 필요한 컬럼을 안내한다 (LLM 호출 없음)', async () => {
    const { app, llm } = make([]);
    const res = await post(app, '/api/tools/inspection', { csv: 'transaction_date,asset_tag\n2022-01-03,AST-1' });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/없는 컬럼: date, product, test_item, value/);
    expect(llm.calls).toHaveLength(0);
  });

  it('LLM 실패는 502', async () => {
    const { app } = make([err(ErrorCode.LlmCallFailed, 'Not logged in')]);
    expect((await post(app, '/api/tools/inspection', {})).status).toBe(502);
  });

  it('문제 항목(5개)에 대한 평가가 빠진 빈 응답은 거절하고 다시 받는다', async () => {
    const empty = { headline: '분석 결과 요약 문장입니다', assessments: [], monitoring_suggestions: [] };
    const { app, llm } = make([empty, complete]);
    const res = await post(app, '/api/tools/inspection', {});
    expect(res.status).toBe(200);
    expect((await res.json()).ai.assessments).toHaveLength(5);
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1]!.prompt).toContain('5개 항목 모두');
  });
});

describe('POST /api/tools/supplier_report — 협력업체 공문 초안', () => {
  const LETTER =
    '수신: 새봄케이싱(주) 품질팀장님\n\n제목: 케이싱 롤 두께 불균일 건 확인 및 조사 요청\n\n' +
    '안녕하십니까. 한결식품 품질보증팀입니다. 입고된 케이싱 롤 CS-0618에서 롤 안의 두께가 고르지 않은 점이 확인되어 아래와 같이 조사를 요청드립니다. ' +
    '현재 원인은 확정되지 않았으며 당사 보관 조건도 함께 확인 중입니다. 회신은 접수 후 5영업일 이내 부탁드립니다.';
  const base = {
    subject: '케이싱 롤 두께 불균일 건 확인 및 조사 요청',
    summary: '입고된 케이싱 롤의 두께가 고르지 않은 것이 확인되었습니다.',
    facts: [
      { label: '로트', value: 'CS-0618', source_quote: '롤 CS-0618 입고' },
      { label: 'COA', value: '정상 값', source_quote: 'COA는 정상 값으로 와 있음' },
    ],
    our_impact: '생산에는 사용하지 않고 보관 중입니다.',
    not_yet_confirmed: ['두께 불균일의 원인'],
    requests: [{ request: '원인 조사 결과 회신', due: '접수 후 5영업일 이내', priority: 'must' }],
    materials_requested: ['해당 로트 두께 측정 기록'],
    history_refs: ['SI-2025-07'],
    internal_checklist: ['당사 보관 온도 기록 확인'],
    missing_info: ['두께 측정은 어떤 방법으로 했는가?'],
    letter_markdown: LETTER,
  };

  it('샘플 상황으로 공문 초안을 만들고, 업체 기록과 문서 성격·기한을 프롬프트에 넣는다', async () => {
    const { app, llm } = make([base]);
    const res = await post(app, '/api/tools/supplier_report', { case_id: 'SC-001', tone: 'request_action', deadline_days: 7 });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tone).toBe('request_action');
    expect(json.deadline_days).toBe(7);
    const prompt = llm.calls[0]!.prompt;
    expect(prompt).toContain('새봄케이싱');
    expect(prompt).toContain('SI-2025-07'); // 업체 이력이 들어간다
    expect(prompt).toContain('접수 후 7영업일');
    expect(prompt).toContain('원인 조사·시정조치 요청');
    expect(prompt).not.toContain('가상의 업체입니다'); // 시연용 note는 AI에 넘기지 않는다
  });

  it('메모 인용은 원문 대조(verified), 지어낸 인용은 unverified', async () => {
    const withFake = { ...base, facts: [...base.facts, { label: '지어낸 사실', value: '업체가 시인함', source_quote: '업체가 잘못을 인정함' }] };
    const { app } = make([withFake]);
    const json = await (await post(app, '/api/tools/supplier_report', { case_id: 'SC-001' })).json();
    expect(json.facts.map((f: { verified: boolean }) => f.verified)).toEqual([true, true, false]);
    expect(json.unverified_facts).toBe(1);
  });

  it('과거 이슈 인용은 업체 기록에 있는 id만 인정하고, 없는 id는 버린다', async () => {
    const { app } = make([{ ...base, history_refs: ['SI-2025-07', 'SI-9999-99', 'SI-2025-07'] }]);
    const json = await (await post(app, '/api/tools/supplier_report', { case_id: 'SC-001' })).json();
    expect(json.history).toHaveLength(1);
    expect(json.history[0]).toMatchObject({ id: 'SI-2025-07', date: '2025-11-04' });
    expect(json.unknown_refs_dropped).toBe(1);
  });

  it('다른 업체의 이력 id를 인용해도 인정하지 않는다', async () => {
    const { app } = make([{ ...base, history_refs: ['SI-2025-09'] }]); // SC-001은 SUP-01, SI-2025-09는 SUP-04 이력
    const json = await (await post(app, '/api/tools/supplier_report', { case_id: 'SC-001' })).json();
    expect(json.history).toHaveLength(0);
    expect(json.unknown_refs_dropped).toBe(1);
  });

  it('책임을 암시하거나 단정하는 표현을 코드가 잡는다', async () => {
    const risky = { ...base, letter_markdown: LETTER + ' 이는 명백한 귀사의 책임이며 손해 배상을 검토하겠습니다.' };
    const { app } = make([risky]);
    const json = await (await post(app, '/api/tools/supplier_report', { case_id: 'SC-001' })).json();
    const phrases = json.flagged_phrases.map((f: { phrase: string }) => f.phrase);
    expect(phrases).toEqual(expect.arrayContaining(['명백', '귀사의 책임', '손해', '배상']));
    expect(json.flagged_phrases[0].context).toContain('…');
  });

  it('"귀책은 확인 중" 같은 중립적 문장은 경고하지 않고, 단정하는 문장만 경고한다', async () => {
    const neutral = { ...base, letter_markdown: LETTER + ' 현재 원인과 귀책은 확인 중이며 단정할 수 없습니다. 과실 여부도 아직 확정되지 않았습니다. 불량의 원인 및 귀책은 **현재 확인 중**이며 조사 후 안내드리겠습니다.' };
    const { app } = make([neutral]);
    expect((await (await post(app, '/api/tools/supplier_report', { case_id: 'SC-001' })).json()).flagged_phrases).toEqual([]);

    const blame = { ...base, letter_markdown: LETTER + ' 이번 건의 귀책은 귀사에 있다고 판단합니다.' };
    const { app: app2 } = make([blame]);
    const json = await (await post(app2, '/api/tools/supplier_report', { case_id: 'SC-001' })).json();
    expect(json.flagged_phrases.map((f: { phrase: string }) => f.phrase)).toContain('귀책');
  });

  it('깨끗한 공문은 경고가 없다', async () => {
    const { app } = make([base]);
    expect((await (await post(app, '/api/tools/supplier_report', { case_id: 'SC-001' })).json()).flagged_phrases).toEqual([]);
  });

  it('메모를 직접 수정해 보내면 그 메모를 쓰고, 업체는 샘플 상황에서 가져온다', async () => {
    const { app, llm } = make([base]);
    await post(app, '/api/tools/supplier_report', { case_id: 'SC-001', text: '수정한 메모: 롤 CS-0618 입고' });
    expect(llm.calls[0]!.prompt).toContain('수정한 메모');
    expect(llm.calls[0]!.prompt).toContain('새봄케이싱');
  });

  it('입력 검증: 업체·메모 누락 400, 없는 업체·상황 404, 잘못된 기한·문서성격 400', async () => {
    const { app } = make([]);
    expect((await post(app, '/api/tools/supplier_report', {})).status).toBe(400);
    expect((await post(app, '/api/tools/supplier_report', { supplier_id: 'SUP-01' })).status).toBe(400);
    expect((await post(app, '/api/tools/supplier_report', { supplier_id: 'SUP-99', text: 'x' })).status).toBe(404);
    expect((await post(app, '/api/tools/supplier_report', { case_id: 'SC-999' })).status).toBe(404);
    expect((await post(app, '/api/tools/supplier_report', { case_id: 'SC-001', deadline_days: 0 })).status).toBe(400);
    expect((await post(app, '/api/tools/supplier_report', { case_id: 'SC-001', tone: 'threat' })).status).toBe(400);
  });

  it('공문 본문이 너무 짧은 빈 응답은 거절하고 다시 받는다', async () => {
    const { app, llm } = make([{ ...base, letter_markdown: '짧음' }, base]);
    expect((await post(app, '/api/tools/supplier_report', { case_id: 'SC-001' })).status).toBe(200);
    expect(llm.calls).toHaveLength(2);
  });

  it('샘플 목록을 내려준다', async () => {
    const { app } = make([]);
    expect(await (await app.request('/api/seed/suppliers')).json()).toHaveLength(5);
    expect(await (await app.request('/api/seed/supplier_cases')).json()).toHaveLength(5);
  });
});

describe('POST /api/tools/ncr — 메모 원문 인용 검증', () => {
  const base = {
    title: '소시지라인 금속검출기 연속 반응',
    nc_type: 'foreign_matter',
    severity: 'major',
    severity_reason: '금속검출기 연속 반응, 이물 미확인',
    affected_scope: '로트 S0626-02 (그 외 범위는 확인 필요)',
    immediate_actions: ['해당 로트 보류'],
    disposition: { proposal: 'hold', reason: '원인 확인 전까지 보류' },
    five_whys: [{ why: '왜 반응했나', answer: '칼날 마모 가능성', basis: 'assumption' }],
    corrective_actions: ['칼날 점검'],
    preventive_actions: ['칼날 교체 주기 설정'],
    missing_info: ['배출된 12개의 재검사 결과는?'],
    report_to_authority: false,
    report_markdown: '# 부적합 보고서',
  };
  const facts = [
    { label: '로트', value: 'S0626-02', source_quote: '로트 S0626-02' },
    { label: '반응 횟수', value: '3회', source_quote: '금속검출기 3회 연속 반응함' },
    { label: '지어낸 사실', value: '작업자 이OO', source_quote: '작업자 이OO가 발견' },
  ];

  it('메모에 있는 인용은 verified, 지어낸 인용은 unverified로 표시한다', async () => {
    const { app, llm } = make([{ ...base, facts }]);
    const res = await post(app, '/api/tools/ncr', { memo_id: 'NM-001' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.facts.map((f: { verified: boolean }) => f.verified)).toEqual([true, true, false]);
    expect(json.unverified_facts).toBe(1);
    expect(llm.calls[0]!.prompt).toContain('S0626-02'); // 메모 원문이 프롬프트에 들어간다
    expect(llm.calls[0]!.prompt).toContain('지어내지 말고');
  });

  it('공백·줄바꿈 차이는 무시하고 대조한다', async () => {
    const { app } = make([{ ...base, facts: [{ label: '로트', value: 'x', source_quote: '로트   S0626-02' }] }]);
    const json = await (await post(app, '/api/tools/ncr', { memo_id: 'NM-001' })).json();
    expect(json.facts[0].verified).toBe(true);
  });

  it('빈 인용문은 검증 실패로 본다', async () => {
    const { app } = make([{ ...base, facts: [{ label: '로트', value: 'x', source_quote: '   ' }] }]);
    const json = await (await post(app, '/api/tools/ncr', { memo_id: 'NM-001' })).json();
    expect(json.facts[0].verified).toBe(false);
  });

  it('직접 입력한 메모도 처리한다', async () => {
    const { app } = make([{ ...base, facts: [{ label: '내용', value: '유리 조각', source_quote: '유리 조각' }] }]);
    const res = await post(app, '/api/tools/ncr', { text: '충진기 근처에서 유리 조각 발견' });
    expect((await res.json()).facts[0].verified).toBe(true);
  });

  it('입력이 없으면 400, 없는 메모는 404, 너무 긴 메모는 400', async () => {
    const { app } = make([]);
    expect((await post(app, '/api/tools/ncr', {})).status).toBe(400);
    expect((await post(app, '/api/tools/ncr', { memo_id: 'NM-999' })).status).toBe(404);
    expect((await post(app, '/api/tools/ncr', { text: 'x'.repeat(5001) })).status).toBe(400);
  });

  it('AI가 스키마에 안 맞는 값을 주면 재시도 후 502', async () => {
    const bad = { ...base, facts, severity: 'catastrophic' };
    const { app, llm } = make([bad, bad]);
    expect((await post(app, '/api/tools/ncr', { memo_id: 'NM-001' })).status).toBe(502);
    expect(llm.calls).toHaveLength(2);
  });

  it('샘플 메모 목록을 내려준다', async () => {
    const { app } = make([]);
    const memos = await (await app.request('/api/seed/ncr_memos')).json();
    expect(memos).toHaveLength(6);
    expect(memos[0]).toMatchObject({ id: 'NM-001' });
  });
});

describe('POST /api/tools/regulation', () => {
  const impact = (over: object) => ({
    product_id: 'P-RAMEN',
    article_no: '제1조',
    quoted_text: '스프류에 사용하는 보존료의 사용량은 최종 제품 기준 1.0g/kg 이하로 한다',
    level: 'high',
    reason: '라면 스프에 보존료 사용',
    actions: ['보존료 사용량 재검토'],
    ...over,
  });

  it('인용문이 조문에 실제로 있으면 verified=true, 지어낸 인용문은 false', async () => {
    const { app } = make([
      {
        summary: '보존료 기준 강화',
        impacts: [impact({}), impact({ product_id: 'P-SAUCE', quoted_text: '소스류는 보존료를 전면 금지한다' })],
        general_actions: ['규격서 개정'],
      },
    ]);
    const res = await post(app, '/api/tools/regulation', { regulation_id: 'R-001' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.impacts[0].citation_verified).toBe(true);
    expect(json.impacts[1].citation_verified).toBe(false);
  });

  it('존재하지 않는 품목 id는 버리고 개수를 알려준다', async () => {
    const { app } = make([
      { summary: 's', impacts: [impact({}), impact({ product_id: 'P-GHOST' })], general_actions: [] },
    ]);
    const json = await (await post(app, '/api/tools/regulation', { regulation_id: 'R-001' })).json();
    expect(json.impacts).toHaveLength(1);
    expect(json.unknown_products_dropped).toBe(1);
  });

  it('조문 번호가 틀리면 인용 검증 실패', async () => {
    const { app } = make([{ summary: 's', impacts: [impact({ article_no: '제9조' })], general_actions: [] }]);
    const json = await (await post(app, '/api/tools/regulation', { regulation_id: 'R-001' })).json();
    expect(json.impacts[0].citation_verified).toBe(false);
  });

  it('없는 법규 id는 404', async () => {
    const { app } = make([]);
    expect((await post(app, '/api/tools/regulation', { regulation_id: 'R-999' })).status).toBe(404);
  });

  it('프롬프트에 조문 원문과 품목 카드를 넣는다', async () => {
    const { app, llm } = make([{ summary: 's', impacts: [], general_actions: [] }]);
    await post(app, '/api/tools/regulation', { regulation_id: 'R-002' });
    expect(llm.calls[0]!.prompt).toContain('참깨');
    expect(llm.calls[0]!.prompt).toContain('P-DUMPLING');
  });
});

describe('POST /api/tools/claim', () => {
  const ai = {
    is_claim: true,
    category: 'foreign_matter',
    severity: 'critical',
    severity_reason: '금속 이물, 어린이 섭취 가능성',
    health_risk: true,
    immediate_actions: ['제품 회수 요청'],
    investigation_items: ['A0912-03 금속검출기 기록'],
    report_to_authority: true,
    reply_draft: '불편을 드려 죄송합니다.',
  };

  it('seed 클레임 id로 분류하고 품목 카드를 프롬프트에 포함한다', async () => {
    const { app, llm } = make([ai]);
    const res = await post(app, '/api/tools/claim', { claim_id: 'CL-001' });
    expect(res.status).toBe(200);
    expect((await res.json()).severity).toBe('critical');
    expect(llm.calls[0]!.prompt).toContain('A0912-03');
    expect(llm.calls[0]!.prompt).toContain('P-RAMEN');
  });

  it('직접 입력한 텍스트도 처리한다', async () => {
    const { app } = make([ai]);
    expect((await post(app, '/api/tools/claim', { text: '과자에서 유리 조각' })).status).toBe(200);
  });

  it('입력이 없으면 400, 없는 id는 404', async () => {
    const { app } = make([]);
    expect((await post(app, '/api/tools/claim', {})).status).toBe(400);
    expect((await post(app, '/api/tools/claim', { claim_id: 'CL-999' })).status).toBe(404);
  });

  it('AI가 스키마에 안 맞는 값을 주면 재시도 후 502', async () => {
    const { app, llm } = make([{ ...ai, severity: 'catastrophic' }, { ...ai, severity: 'catastrophic' }]);
    const res = await post(app, '/api/tools/claim', { claim_id: 'CL-001' });
    expect(res.status).toBe(502);
    expect(llm.calls).toHaveLength(2);
  });
});

describe('GET /api/seed/*', () => {
  it('시드 데이터를 내려준다', async () => {
    const { app } = make([]);
    expect((await (await app.request('/api/seed/claims')).json()).length).toBe(8);
    expect((await (await app.request('/api/seed/regulations')).json()).length).toBe(3);
    expect((await app.request('/api/seed/production')).headers.get('content-type')).toContain('text/plain');
  });
});
