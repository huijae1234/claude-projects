import { fileURLToPath } from 'node:url';
const SEED_DIR = fileURLToPath(new URL('../seed', import.meta.url));
/**
 * 데모 서버: Claude 로그인 없이 UI를 확인하기 위한 가짜 응답 서버. (실제 AI 분석이 아님)
 * 실행: npm run dev:demo   → 화면 상단에 "데모 모드" 배너가 표시된다.
 */
import { serve } from '@hono/node-server';
import { createApp } from '../src/server/app';
import type { LlmClient, LlmRequest } from '../src/server/application/llm';
import { ok } from '../src/shared/result';

const demo: LlmClient = {
  async complete(req: LlmRequest) {
    await new Promise((r) => setTimeout(r, 700));
    const p = req.jsonSchema.properties as Record<string, unknown>;
    if ('monitoring_suggestions' in p) {
      const keys = ['햄|중량', '발효유|pH', '소시지|수분', '소시지|염도', '우유|산도'];
      return ok({
        headline: '[데모] 햄 중량이 규격 하한 아래로 내려갔습니다. 가장 먼저 조치하세요.',
        assessments: keys.map((k) => ({
          series_key: k,
          interpretation: `[데모] ${k} 항목의 이상 징후 해석 문장입니다. 실제 Claude 분석이 아닙니다.`,
          probable_causes: ['[데모] 설비 설정 변동(추정)'],
          actions: [{ action: '[데모] 설정값 확인', urgency: 'within_week', owner: '품질관리' }],
          needs_ncr: k === '햄|중량',
        })),
        monitoring_suggestions: [{ target: '햄 중량', suggestion: '[데모] 2시간마다 측정' }],
      });
    }
    if ('history_refs' in p) {
      return ok({
        subject: '[데모] 케이싱 롤 두께 불균일 건 확인 및 조사 요청', summary: '[데모] 입고된 케이싱 롤의 두께가 고르지 않았습니다.',
        facts: [{ label: '로트', value: 'CS-0618', source_quote: '롤 CS-0618 입고' }, { label: '(데모) 일부러 틀린 인용', value: '확인용', source_quote: '메모에 없는 문장' }],
        our_impact: '[데모] 생산에는 사용하지 않고 보관 중', not_yet_confirmed: ['[데모] 원인'],
        requests: [{ request: '[데모] 원인 조사 결과 회신', due: '접수 후 5영업일 이내', priority: 'must' }],
        materials_requested: ['[데모] 두께 측정 기록'], history_refs: ['SI-2025-07', 'SI-9999-99'],
        internal_checklist: ['[데모] 당사 보관 조건 확인'], missing_info: ['[데모] 측정 방법은?'],
        letter_markdown: '[데모] 수신: 새봄케이싱(주) 품질팀장님. 입고된 케이싱 롤에서 두께 불균일이 확인되어 조사를 요청드립니다. 이는 명백한 귀사의 책임으로 보이며 손해 배상을 검토하겠습니다. (데모: 책임 단정 표현 경고 확인용 문장)',
      });
    }
    if ('five_whys' in p) {
      return ok({
        title: '[데모] 소시지라인 금속검출기 연속 반응', nc_type: 'foreign_matter', severity: 'major', severity_reason: '[데모] 잠정 등급입니다.',
        facts: [{ label: '로트', value: 'S0626-02', source_quote: '로트 S0626-02' }, { label: '(데모) 일부러 틀린 인용', value: '확인용', source_quote: '메모에 없는 문장' }],
        affected_scope: '[데모] 영향 범위 설명', immediate_actions: ['[데모] 해당 로트 보류'],
        disposition: { proposal: 'hold', reason: '[데모] 원인 확정 전까지 보류' },
        five_whys: [{ why: '왜 반응했나', answer: '[데모] 칼날 마모 가능성', basis: 'assumption' }],
        corrective_actions: ['[데모] 칼날 점검'], preventive_actions: ['[데모] 교체 주기 설정'],
        missing_info: ['[데모] 반응 시각은?'], report_to_authority: false, report_markdown: '# [데모] 부적합 보고서',
      });
    }
    if ('assessments' in p) {
      return ok({
        headline: '[데모] TUM-01 진공 텀블러의 베어링 과열이 가장 시급합니다. 이번 주 안에 점검하세요.',
        assessments: [
          { machine_id: 'TUM-01', probable_failure_mode: '베어링 윤활 불량 또는 마모 (추정)', evidence: ['베어링 온도 기준 대비 +18%', '진동 +44.7%'], actions: [{ action: '베어링 윤활 상태·그리스 점검', urgency: 'immediate', owner: '설비팀' }, { action: '예비 베어링 확보', urgency: 'within_week', owner: '구매팀' }], spare_parts: ['베어링 세트'] },
          { machine_id: 'CUT-01', probable_failure_mode: '칼날 마모 (추정)', evidence: ['진동 +9.9%', '모터 전류 +5.2%'], actions: [{ action: '칼날 교체 일정 앞당기기', urgency: 'next_pm', owner: '설비팀' }], spare_parts: ['커터 칼날 세트'] },
        ],
        alarm_rules: [{ machine_type: '고압 균질기', metric: 'vibration_mms', rule: '7일 이동평균이 정상 기준 대비 +3σ 이상', rationale: '[데모] 고장 14일 전부터 진동이 상승' }],
        pm_plan_markdown: '# [데모] 이번 주 예방정비 계획\n\n1. TUM-01 베어링 점검 (즉시)\n2. CUT-01 칼날 교체 준비',
      });
    }
    if ('findings' in p) {
      return ok({
        headline: '[데모] B라인 수율 하락(9/14~16)과 C라인 모터 고장(9/22)이 이번 달 핵심 이슈입니다.',
        findings: [
          { line: 'B라인', dates: '9/14~16', problem: '수율이 중앙값보다 크게 떨어졌습니다.', hypotheses: [{ cause: '캡 실링 불량', evidence: '현장 기록에 실링 불량·충진량 편차 기재', how_to_verify: '캡핑 헤드 토크와 노즐 막힘 점검' }] },
          { line: 'C라인', dates: '9/22', problem: '210분 장시간 정지', hypotheses: [{ cause: '순환 모터 과열', evidence: '정지 사유에 모터 과열 기재', how_to_verify: '모터 정비 이력 확인' }] },
        ],
        report_markdown: '# [데모] 9월 생산 보고서\n\n- B라인 수율 하락\n- C라인 설비 정지\n- A라인 금속검출 급증',
      });
    }
    if ('impacts' in p) {
      return ok({
        summary: '[데모] 면류 스프 보존료 사용 기준이 강화됩니다.',
        impacts: [
          { product_id: 'P-RAMEN', article_no: '제1조', quoted_text: '스프류에 사용하는 보존료의 사용량은 최종 제품 기준 1.0g/kg 이하로 한다', level: 'high', reason: '라면 스프에 보존료를 사용합니다.', actions: ['품질관리팀: 현행 사용량 확인', 'R&D: 대체 배합 검토'] },
          { product_id: 'P-SAUCE', article_no: '제1조', quoted_text: '소스류는 보존료를 전면 금지한다', level: 'low', reason: '(데모) 일부러 틀린 인용문 — 인용 검증 경고가 뜨는지 확인용', actions: [] },
        ],
        general_actions: ['규격서 개정', '보관 안정성 시험 성적서 준비'],
      });
    }
    return ok({
      is_claim: true, category: 'foreign_matter', severity: 'critical', severity_reason: '[데모] 금속 이물이며 어린이 섭취 가능성이 있습니다.',
      health_risk: true, immediate_actions: ['고객 제품 회수 요청', '동일 로트 출고 보류 검토'], investigation_items: ['해당 로트 금속검출기 기록', '면대 절단 롤러 마모 점검'],
      report_to_authority: true, reply_draft: '[데모] 불편과 걱정을 드려 죄송합니다. 제품을 회수하여 원인을 확인한 뒤 결과를 안내드리겠습니다.',
    });
  },
};

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: createApp({ llm: demo, seedDir: SEED_DIR, mode: 'demo' }).fetch, port }, () => console.log(`demo server: http://localhost:${port}`));
