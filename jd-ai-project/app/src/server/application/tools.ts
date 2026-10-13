import { z } from 'zod';
import { type AppError, type Result, ok } from '../../shared/result';
import { type EquipmentAnalysis, type EquipmentRow, analyzeEquipment } from '../domain/equipment';
import { type InspectionAnalysis, type InspectionRow, analyzeInspection } from '../domain/inspection';
import type { Claim, Product, ProductionRow, Regulation, Supplier } from '../domain/seed';
import { type FlaggedRow, type ProductionStats, analyzeProduction } from '../domain/stats';
import { type LlmClient, generateStructured } from './llm';

const SYSTEM =
  '당신은 식품 제조업(생산·품질) 실무 보조 AI입니다. 한국어로 간결하고 실무적으로 답하세요. ' +
  '제공된 데이터에 없는 사실은 지어내지 말고, 추정은 "추정"이라고 표시하세요. ' +
  '당신의 결과는 사람이 검토할 초안입니다.';

// ───────────── 생산기술: 생산지표 분석 ─────────────

export const ProductionAiSchema = z.object({
  headline: z.string().describe('이번 기간 핵심 한 줄 요약'),
  findings: z
    .array(
      z.object({
        line: z.string(),
        dates: z.string().describe('해당 날짜 또는 기간'),
        problem: z.string(),
        hypotheses: z
          .array(
            z.object({
              cause: z.string().describe('원인 가설'),
              evidence: z.string().describe('입력 데이터에서 찾은 근거'),
              how_to_verify: z.string().describe('현장에서 확인할 방법'),
            }),
          )
          .min(1)
          .max(3),
      }),
    )
    .describe('이상치 묶음별 분석'),
  report_markdown: z.string().describe('공장장 보고용 주간/월간 보고서 초안(마크다운)'),
});
export type ProductionAi = z.infer<typeof ProductionAiSchema>;

export interface ProductionResult {
  stats: ProductionStats;
  ai: ProductionAi;
}

export async function analyzeProductionTool(
  llm: LlmClient,
  rows: ProductionRow[],
): Promise<Result<ProductionResult, AppError>> {
  const stats = analyzeProduction(rows);
  const flaggedText = stats.flagged.length
    ? stats.flagged.map((f: FlaggedRow) => JSON.stringify(f)).join('\n')
    : '(탐지된 이상치 없음)';

  const ai = await generateStructured(llm, {
    system: SYSTEM,
    prompt:
      `아래는 코드가 계산한 생산 지표와 이상치입니다. 숫자는 이미 검증되었으니 다시 계산하지 마세요.\n` +
      `이상치를 날짜·라인으로 묶어 원인 가설(근거와 확인 방법 포함)을 세우고, 보고서 초안을 쓰세요.\n\n` +
      `[라인별 통계]\n${JSON.stringify(stats.perLine)}\n\n[이상치 행]\n${flaggedText}`,
    schema: ProductionAiSchema,
  });
  if (!ai.ok) return ai;
  return ok({ stats, ai: ai.value });
}

// ───────────── 생산기술: 설비 이상 진단 ─────────────

export const EquipmentAiSchema = z.object({
  headline: z.string().describe('지금 가장 먼저 봐야 할 설비와 이유를 한 줄로'),
  assessments: z
    .array(
      z.object({
        machine_id: z.string(),
        probable_failure_mode: z.string().describe('예상 고장 유형(추정)'),
        evidence: z.array(z.string()).describe('입력된 분석 수치에서 찾은 근거'),
        actions: z.array(
          z.object({
            action: z.string(),
            urgency: z.enum(['immediate', 'within_week', 'next_pm']),
            owner: z.string().describe('담당 부서'),
          }),
        ),
        spare_parts: z.array(z.string()).describe('미리 확보할 부품'),
      }),
    )
    .describe('위험도가 low가 아니거나 고장 이력이 있는 설비만'),
  alarm_rules: z
    .array(
      z.object({
        machine_type: z.string(),
        metric: z.string(),
        rule: z.string().describe('경보 기준 제안. 예: 7일 이동평균이 기준 대비 +3σ 이상'),
        rationale: z.string().describe('과거 고장 전조에서 얻은 근거'),
      }),
    )
    .describe('과거 고장 전조 패턴에서 뽑은 조기 경보 기준 제안'),
  pm_plan_markdown: z.string().describe('이번 주 예방정비 우선순위 계획(마크다운)'),
});
export type EquipmentAi = z.infer<typeof EquipmentAiSchema>;

export interface EquipmentResult {
  analysis: EquipmentAnalysis;
  ai: EquipmentAi;
  unknown_machines_dropped: number;
}

export async function equipmentDiagnosisTool(
  llm: LlmClient,
  rows: EquipmentRow[],
): Promise<Result<EquipmentResult, AppError>> {
  const analysis = analyzeEquipment(rows);
  const ai = await generateStructured(llm, {
    system: SYSTEM,
    prompt:
      `아래는 코드가 계산한 설비별 이상 징후 분석입니다. 숫자와 위험도는 이미 검증되었으니 바꾸거나 다시 계산하지 마세요.\n` +
      `- risk: 코드가 정한 현재 위험도\n- current_flags: 최근 구간이 정상 기준선에서 벗어난 지표(z는 표준편차 배수, kind=unstable은 평균은 같지만 변동이 커진 것)\n` +
      `- breakdowns[].precursors: 과거 고장 직전에 이미 달라지고 있던 지표\n\n` +
      `할 일: ① 위험도가 low가 아니거나 고장 이력이 있는 설비의 예상 고장 유형·근거·조치·확보할 부품 ` +
      `② 과거 고장 전조에서 얻은 조기 경보 기준 제안 ③ 이번 주 예방정비 우선순위 계획.\n` +
      `근거는 아래 데이터에 있는 것만 쓰고, 고장 유형은 "추정"으로 표시하세요.\n\n` +
      `[설비별 분석]\n${JSON.stringify(analysis.machines)}`,
    schema: EquipmentAiSchema,
  });
  if (!ai.ok) return ai;

  const known = new Set(analysis.machines.map((m) => m.machine_id));
  const kept = ai.value.assessments.filter((a) => known.has(a.machine_id));
  return ok({
    analysis,
    ai: { ...ai.value, assessments: kept },
    unknown_machines_dropped: ai.value.assessments.length - kept.length,
  });
}

// ───────────── 품질관리: 검사 데이터 이상 탐지 ─────────────

export const InspectionAiSchema = z.object({
  headline: z.string().describe('지금 가장 먼저 봐야 할 항목과 이유를 한 줄로'),
  assessments: z
    .array(
      z.object({
        series_key: z.string().describe('분석 결과의 key 그대로. 예: "햄|중량"'),
        interpretation: z.string().describe('이 항목에서 무슨 일이 일어나고 있는지 쉬운 말로'),
        probable_causes: z.array(z.string()).describe('추정 원인(입력에 근거가 있는 것만, "추정" 표시)'),
        actions: z.array(
          z.object({
            action: z.string(),
            urgency: z.enum(['immediate', 'within_week', 'next_pm']),
            owner: z.string().describe('담당 부서'),
          }),
        ),
        needs_ncr: z.boolean().describe('부적합 보고서를 작성해야 하는가 (규격 이탈이 있으면 true)'),
      }),
    )
    .describe('위험도가 low가 아닌 항목만'),
  monitoring_suggestions: z
    .array(z.object({ target: z.string(), suggestion: z.string() }))
    .describe('재발·악화를 빨리 알아채기 위한 모니터링 제안(검사 빈도, 경보 기준 등)'),
});
export type InspectionAi = z.infer<typeof InspectionAiSchema>;

export interface InspectionResult {
  analysis: InspectionAnalysis;
  ai: InspectionAi;
  unknown_series_dropped: number;
}

export async function inspectionTool(llm: LlmClient, rows: InspectionRow[]): Promise<Result<InspectionResult, AppError>> {
  const analysis = analyzeInspection(rows);
  // AI에는 점 데이터 대신 요약만 넘긴다 (토큰 절약, 숫자는 코드가 이미 계산함)
  const compact = analysis.series.map(({ points: _points, ...rest }) => rest);
  // 위험도가 low가 아닌 항목이 있는데 평가가 비어 있거나 모자라면 응답을 거절하고 다시 받는다.
  const expected = analysis.series.filter((x) => x.risk !== 'low').length;
  const schema = InspectionAiSchema.refine((v) => v.assessments.length >= expected, {
    message: `위험도가 low가 아닌 ${expected}개 항목 모두에 대한 assessments가 필요합니다`,
    path: ['assessments'],
  });
  const ai = await generateStructured(llm, {
    system: SYSTEM,
    prompt:
      `아래는 코드가 계산한 검사 항목별 관리도·공정능력 분석입니다. 숫자와 위험도는 이미 검증되었으니 바꾸거나 다시 계산하지 마세요.\n` +
      `- baseline: 정상 기준선(처음 30개)의 평균·표준편차·관리한계(±3σ)\n- recent: 최근 14개\n` +
      `- violations: oos=규격 이탈, beyond_3sigma=관리한계 이탈, shift=평균 이동(한쪽에 연속 8개), trend=추세, spread=산포 증가, capability=Cpk 부족. recent=true면 지금 진행 중\n` +
      `- cpk: 1.33 이상이면 충분, 1.0 미만이면 부족\n\n` +
      `할 일: ① 위험도가 low가 아닌 항목마다 무슨 일이 벌어지는지 쉬운 말로 해석하고, 입력 데이터에 근거가 있는 추정 원인·조치·담당 부서를 제시 ` +
      `② 규격 이탈이 있으면 needs_ncr=true ③ 악화를 빨리 알아챌 모니터링 제안.\n` +
      `규격 안이라도 평균 이동·추세는 "아직 합격이지만 조기 경보"로 설명하세요. 원인은 "추정"으로 표시하고, 입력에 없는 사실은 쓰지 마세요.\n\n` +
      `[검사 항목별 분석]\n${JSON.stringify(compact)}`,
    schema,
  });
  if (!ai.ok) return ai;

  const known = new Set(analysis.series.map((s) => s.key));
  const kept = ai.value.assessments.filter((a) => known.has(a.series_key));
  return ok({
    analysis,
    ai: { ...ai.value, assessments: kept },
    unknown_series_dropped: ai.value.assessments.length - kept.length,
  });
}

// ───────────── 품질관리: 부적합 보고서(NCR) 초안 ─────────────

export const NcrAiSchema = z.object({
  title: z.string().describe('부적합 보고서 제목(한 줄)'),
  nc_type: z.enum(['foreign_matter', 'spec_deviation', 'process_deviation', 'packaging', 'labeling', 'material', 'other']),
  severity: z.enum(['critical', 'major', 'minor']),
  severity_reason: z.string(),
  facts: z
    .array(
      z.object({
        label: z.string().describe('항목명. 예: 로트, 발생 시각, 수량'),
        value: z.string(),
        source_quote: z.string().describe('메모 원문에서 글자 그대로 복사한 근거 문장·구절. 수정 금지'),
      }),
    )
    .describe('메모에 적힌 사실만. 메모에 없는 것은 넣지 말 것'),
  affected_scope: z.string().describe('영향 범위. 메모에서 알 수 있는 것과 모르는 것을 구분해서'),
  immediate_actions: z.array(z.string()).describe('즉시 조치(격리·보류·선별 등)'),
  disposition: z.object({
    proposal: z.enum(['hold', 'rework', 'scrap', 'conditional_release', 'return_to_supplier', 'undetermined']),
    reason: z.string(),
  }),
  five_whys: z
    .array(
      z.object({
        why: z.string(),
        answer: z.string(),
        basis: z.enum(['memo', 'assumption']).describe('메모에 근거가 있으면 memo, 아니면 assumption'),
      }),
    )
    .describe('3~5단계. 근거가 없는 단계는 assumption으로 표시'),
  corrective_actions: z.array(z.string()).describe('시정 조치'),
  preventive_actions: z.array(z.string()).describe('재발 방지 조치'),
  missing_info: z.array(z.string()).describe('보고서를 완성하려면 현장에 되물어야 할 질문'),
  report_to_authority: z.boolean().describe('관할 기관 보고 검토가 필요한가'),
  report_markdown: z.string().describe('표준 양식 부적합 보고서 본문(마크다운). 모르는 항목은 "확인 필요"로 표시'),
});
export type NcrAi = z.infer<typeof NcrAiSchema>;

export interface NcrResult extends Omit<NcrAi, 'facts'> {
  facts: Array<NcrAi['facts'][number] & { verified: boolean }>;
  unverified_facts: number;
}

const squash = (t: string) => t.replace(/\s+/g, ' ').trim();

export async function ncrDraftTool(llm: LlmClient, memo: string): Promise<Result<NcrResult, AppError>> {
  const ai = await generateStructured(llm, {
    system: SYSTEM,
    prompt:
      `아래 [현장 메모]로 부적합 보고서 초안을 작성하세요.\n` +
      `- 메모에 적힌 사실만 facts에 넣고, source_quote는 메모에서 글자 그대로 복사하세요.\n` +
      `- 메모에 없는 정보(원인, 수량, 시각, 담당자 등)는 지어내지 말고 missing_info에 되물을 질문으로 적고, 보고서 본문에는 "확인 필요"로 표시하세요.\n` +
      `- 5Why에서 메모에 근거가 없는 단계는 basis를 assumption으로 표시하세요.\n` +
      `- 원인을 단정하지 말고, 처분(disposition)은 제안일 뿐 최종 판정은 품질 책임자가 합니다.\n\n` +
      `[현장 메모]\n${memo}`,
    schema: NcrAiSchema,
  });
  if (!ai.ok) return ai;

  // 환각 방지: AI가 "메모에 이렇게 적혀 있다"고 인용한 구절이 실제 메모에 있는지 코드가 검증한다.
  const body = squash(memo);
  const facts = ai.value.facts.map((f) => {
    const q = squash(f.source_quote);
    return { ...f, verified: q.length > 0 && body.includes(q) };
  });
  return ok({ ...ai.value, facts, unverified_facts: facts.filter((f) => !f.verified).length });
}

// ───────────── 품질관리: 법규 개정 영향도 ─────────────

export const RegulationAiSchema = z.object({
  summary: z.string().describe('개정 내용 요약(비전문가도 이해 가능하게)'),
  impacts: z.array(
    z.object({
      product_id: z.string(),
      article_no: z.string().describe('근거 조문 번호. 예: 제1조'),
      quoted_text: z.string().describe('근거 조문에서 그대로 인용한 문장(수정 금지)'),
      level: z.enum(['high', 'medium', 'low', 'none']),
      reason: z.string(),
      actions: z.array(z.string()).describe('필요 조치(담당 부서 포함)'),
    }),
  ),
  general_actions: z.array(z.string()).describe('품목과 무관한 공통 조치'),
});
export type RegulationAi = z.infer<typeof RegulationAiSchema>;

export interface RegulationResult {
  regulation_id: string;
  summary: string;
  impacts: Array<RegulationAi['impacts'][number] & { citation_verified: boolean }>;
  general_actions: string[];
  unknown_products_dropped: number;
}

export async function regulationImpactTool(
  llm: LlmClient,
  regulation: Regulation,
  products: Product[],
): Promise<Result<RegulationResult, AppError>> {
  const articleText = regulation.articles.map((a) => `${a.no}: ${a.text}`).join('\n');
  const ai = await generateStructured(llm, {
    system: SYSTEM,
    prompt:
      `아래 [개정 조문]의 범위 안에서만 판단하세요. 조문에 없는 내용은 근거로 쓰지 마세요.\n` +
      `각 품목마다 영향도를 판단하고, 근거 조문(quoted_text)은 조문 원문에서 글자 그대로 복사하세요.\n` +
      `영향이 없는 품목은 level을 none으로 하고 이유를 쓰세요.\n\n` +
      `[개정 조문] ${regulation.title} (시행일 ${regulation.effective_date})\n${articleText}\n\n` +
      `[자사 품목 카드]\n${JSON.stringify(products)}`,
    schema: RegulationAiSchema,
  });
  if (!ai.ok) return ai;

  const known = new Set(products.map((p) => p.id));
  const kept = ai.value.impacts.filter((i) => known.has(i.product_id));
  // 환각 방지: 인용문이 실제 조문에 있는지는 코드가 검증한다.
  const impacts = kept.map((i) => {
    const article = regulation.articles.find((a) => a.no === i.article_no);
    const quote = i.quoted_text.trim();
    return { ...i, citation_verified: !!article && quote.length > 0 && article.text.includes(quote) };
  });

  return ok({
    regulation_id: regulation.id,
    summary: ai.value.summary,
    impacts,
    general_actions: ai.value.general_actions,
    unknown_products_dropped: ai.value.impacts.length - kept.length,
  });
}

// ───────────── 품질보증: 클레임 분류·회신 ─────────────

export const ClaimAiSchema = z.object({
  is_claim: z.boolean().describe('품질 불만이 아닌 단순 의견·문의면 false'),
  category: z.enum(['foreign_matter', 'allergen', 'packaging', 'labeling', 'quantity', 'taste_odor', 'spoilage', 'other']),
  severity: z.enum(['critical', 'major', 'minor', 'inquiry']),
  severity_reason: z.string(),
  health_risk: z.boolean().describe('소비자 건강 피해 가능성이 있는가'),
  immediate_actions: z.array(z.string()).describe('접수 직후 해야 할 조치'),
  investigation_items: z.array(z.string()).describe('원인 조사 항목(로트·공정·기록 기준)'),
  report_to_authority: z.boolean().describe('관할 기관 보고 검토가 필요한가'),
  reply_draft: z.string().describe('고객 회신문 초안. 원인을 단정하지 말고 사과·조치·후속 안내를 담을 것'),
});
export type ClaimAi = z.infer<typeof ClaimAiSchema>;

export async function claimTriageTool(
  llm: LlmClient,
  claim: Pick<Claim, 'text'> & Partial<Pick<Claim, 'lot' | 'channel'>>,
  product?: Product,
): Promise<Result<ClaimAi, AppError>> {
  return generateStructured(llm, {
    system: SYSTEM,
    prompt:
      `소비자 클레임을 분류하고 대응 초안을 만드세요. 건강 위해(이물, 알레르기 등)가 의심되면 severity를 높게 판단하세요.\n` +
      `회신문은 원인을 단정하지 말고, 사과 → 조치 → 후속 안내 순으로 쓰세요.\n\n` +
      `[클레임]\n채널: ${claim.channel ?? '미상'}\n로트: ${claim.lot ?? '미상'}\n내용: ${claim.text}\n\n` +
      `[관련 품목]\n${product ? JSON.stringify(product) : '(미지정)'}`,
    schema: ClaimAiSchema,
  });
}

// ───────────── 품질보증: 협력업체 품질 이슈 통보서(공문) 초안 ─────────────

export const SUPPLIER_TONES = {
  inform: '상황 공유·협조 요청',
  request_action: '원인 조사·시정조치 요청',
  formal_corrective: '공식 시정조치 요구',
} as const;
export type SupplierTone = keyof typeof SUPPLIER_TONES;

const TONE_GUIDE: Record<SupplierTone, string> = {
  inform: '협력적인 어조. 확정되지 않은 일을 단정하지 않고, 자료 공유와 의견을 구하는 요청 위주로 쓴다.',
  request_action: '정중하지만 분명한 어조. 원인 조사와 회신(조사 결과·조치 계획)을 요청한다.',
  formal_corrective: '공식 문서 어조. 회신 기한을 명시하고 원인 분석·시정조치·재발방지 대책서 제출을 요구한다.',
};

export const SupplierReportAiSchema = z.object({
  subject: z.string().describe('공문 제목(한 줄)'),
  summary: z.string().describe('현황 요약 2~3문장. 확인된 사실만'),
  facts: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        source_quote: z.string().describe('상황 메모 원문에서 글자 그대로 복사한 근거 구절. 수정 금지'),
      }),
    )
    .describe('메모에 적힌 사실만'),
  our_impact: z.string().describe('우리 쪽에 이미 생긴 영향. 메모에 있는 것만'),
  not_yet_confirmed: z.array(z.string()).describe('아직 확정되지 않은 사항(원인·귀책 등). 공문에서 단정하지 말 것'),
  requests: z
    .array(
      z.object({
        request: z.string(),
        due: z.string().describe('회신 기한. 예: "접수 후 5영업일 이내"'),
        priority: z.enum(['must', 'should']),
      }),
    )
    .min(1),
  materials_requested: z.array(z.string()).describe('업체에 요청할 자료(시험성적서, 제조일지, 관리 기록 등)'),
  history_refs: z.array(z.string()).describe('[협력업체 기록]의 history에 있는 이슈 id만. 관련이 없으면 빈 배열'),
  internal_checklist: z.array(z.string()).describe('발송 전 우리 쪽에서 먼저 확인·정리할 것(우리 쪽 원인 배제, 증빙 확보 등)'),
  missing_info: z.array(z.string()).describe('공문을 완성하려면 현장에 되물어야 할 질문'),
  letter_markdown: z.string().min(150).describe('공문 본문(마크다운). 모르는 항목은 [확인 필요]로 표시'),
});
export type SupplierReportAi = z.infer<typeof SupplierReportAiSchema>;

export interface SupplierReportResult extends Omit<SupplierReportAi, 'facts' | 'history_refs'> {
  tone: SupplierTone;
  deadline_days: number;
  facts: Array<SupplierReportAi['facts'][number] & { verified: boolean }>;
  unverified_facts: number;
  /** 업체 기록에서 실제로 확인된 과거 이슈 (AI가 지어낸 id는 걸러낸다) */
  history: Supplier['history'];
  unknown_refs_dropped: number;
  /** 법적 책임·귀책을 암시하거나 단정하는 표현이 공문에 들어갔는지 코드가 검사한 결과 */
  flagged_phrases: Array<{ phrase: string; context: string }>;
}

const RISKY_PHRASES = [
  '배상', '손해', '위약', '변상', '소송', '법적', '계약 해지', '거래 중단', '거래를 중단', '패널티', '페널티',
  '귀책', '과실', '책임을 묻', '귀사의 책임', '귀사 책임', '귀사의 잘못', '명백',
];

/** "귀책은 확인 중이며"처럼 책임을 단정하지 않겠다는 중립적 문장은 경고 대상이 아니다. */
const HEDGED_AFTER = /^\s*(여부|유무|소재)?\s*(은|는|이|가|도|과|와)?\s*((아직|현재|현재로서는|여전히)\s*)*(확인\s*중|확인되지|확정되지|미확정|단정하지|판단하지|밝혀지지|조사\s*중|파악\s*중)/;

/** 공문에서 책임을 암시·단정하는 표현을 찾아 앞뒤 문맥과 함께 돌려준다. */
export function findRiskyPhrases(letter: string): Array<{ phrase: string; context: string }> {
  const out: Array<{ phrase: string; context: string }> = [];
  for (const phrase of RISKY_PHRASES) {
    let from = 0;
    for (let i = letter.indexOf(phrase, from); i !== -1; i = letter.indexOf(phrase, from)) {
      from = i + phrase.length;
      if (HEDGED_AFTER.test(letter.slice(from, from + 28).replace(/[*_]/g, ''))) continue; // 굵게(**) 표시는 무시
      const ctx = letter.slice(Math.max(0, i - 15), from + 15).replace(/\s+/g, ' ');
      out.push({ phrase, context: `…${ctx}…` });
    }
  }
  return out;
}

export interface SupplierReportInput {
  supplier: Supplier;
  memo: string;
  tone: SupplierTone;
  deadlineDays: number;
}

export async function supplierReportTool(
  llm: LlmClient,
  { supplier, memo, tone, deadlineDays }: SupplierReportInput,
): Promise<Result<SupplierReportResult, AppError>> {
  const { note: _note, ...record } = supplier;
  const ai = await generateStructured(llm, {
    system: SYSTEM,
    prompt:
      `협력업체에 보낼 품질 이슈 통보 공문 초안을 작성하세요. 발신은 "한결식품 품질보증팀", 담당자명·연락처 같이 모르는 값은 [확인 필요]로 둡니다.

` +
      `[문서 성격] ${SUPPLIER_TONES[tone]} — ${TONE_GUIDE[tone]}
[회신 기한] 접수 후 ${deadlineDays}영업일 이내

` +
      `규칙:
` +
      `- facts는 [상황 메모]에 적힌 사실만 쓰고 source_quote는 메모에서 글자 그대로 복사하세요.
` +
      `- 원인·귀책이 확정되지 않았으면 단정하지 말고 not_yet_confirmed에 적고, 공문에서도 "확인 중"으로 표현하세요. 메모에 우리 쪽 원인 가능성이 있으면 internal_checklist에 넣고 공문에도 우리 쪽도 함께 확인 중임을 밝히세요.
` +
      `- 입력에 계약 내용이 없으므로 배상·손해·계약 해지·거래 중단 등 법적·계약상 불이익은 언급하지 마세요.
` +
      `- 과거 이력은 [협력업체 기록]의 history에 있는 것만 history_refs로 인용하고, 기록에 없는 과거 사례는 쓰지 마세요. 관련 없는 이력은 인용하지 마세요.
` +
      `- 메모에 없는 정보(수량, 시각, 담당자 등)는 지어내지 말고 missing_info에 되물을 질문으로 적고 공문에는 [확인 필요]로 표시하세요.
` +
      `- 요청 사항마다 회신 기한을 붙이고, 요청 자료 목록(materials_requested)을 구체적으로 쓰세요.

` +
      `[협력업체 기록]
${JSON.stringify(record)}

[상황 메모]
${memo}`,
    schema: SupplierReportAiSchema,
  });
  if (!ai.ok) return ai;

  const body = squash(memo);
  const facts = ai.value.facts.map((f) => {
    const q = squash(f.source_quote);
    return { ...f, verified: q.length > 0 && body.includes(q) };
  });
  // 환각 방지: AI가 인용한 과거 이슈 id가 이 업체 기록에 실제로 있는지 확인한다.
  const known = new Map(supplier.history.map((h) => [h.id, h]));
  const refs = [...new Set(ai.value.history_refs)];
  const history = refs.map((id) => known.get(id)).filter((h): h is Supplier['history'][number] => h !== undefined);

  const { facts: _f, history_refs: _h, ...rest } = ai.value;
  return ok({
    ...rest,
    tone,
    deadline_days: deadlineDays,
    facts,
    unverified_facts: facts.filter((f) => !f.verified).length,
    history,
    unknown_refs_dropped: refs.length - history.length,
    flagged_phrases: findRiskyPhrases(ai.value.letter_markdown),
  });
}
