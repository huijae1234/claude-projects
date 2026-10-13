export type RoleId = 'production' | 'qc' | 'qa';
export type ToolId = 'production' | 'equipment' | 'inspection' | 'ncr' | 'regulation' | 'claim' | 'supplier' | 'hygiene';

export interface FlowStep {
  name: string;
  desc: string;
  /** 이 단계를 돕는 AI 도구 (없으면 아직 도구가 없는 단계) */
  tool?: ToolId;
}

export interface Role {
  id: RoleId;
  name: string;
  where: string;
  mission: string;
  flow: FlowStep[];
  problems: Array<{ problem: string; ai: string }>;
  /** 누가 무엇을 하는가: 숫자·검증은 코드, 해석·초안은 AI, 판단은 사람 */
  split: { code: string; ai: string; human: string };
  tools: Array<{ id: ToolId; name: string; desc: string }>;
}

export const ROLES: Role[] = [
  {
    id: 'production',
    name: '생산기술',
    where: '공장 (안양·평택·음성 등)',
    mission: '생산계획과 공정을 안정시키고, 생산지표와 설비 상태로 개선점을 찾는다.',
    flow: [
      { name: '생산계획 수립', desc: '판매·재고를 보고 품목별 생산량과 라인을 정한다' },
      { name: '라인 배정·품목 전환', desc: '전환 횟수를 줄이고 알레르기 교차오염을 피한다' },
      { name: '공정 이상 대응', desc: '수율 저하·설비 정지의 원인을 추적하고 임시 조치한다', tool: 'equipment' },
      { name: '수율·로스 관리', desc: '투입 대비 양품률과 폐기 로스를 줄인다', tool: 'production' },
      { name: '생산지표 집계·보고', desc: '일·주·월 지표를 모아 공장장에게 보고한다', tool: 'production' },
      { name: '설비 예방정비', desc: '고장 전조를 보고 정비 시점과 부품을 정한다', tool: 'equipment' },
    ],
    problems: [
      { problem: '일·주·월 지표를 엑셀로 모아 보고서를 수작업으로 쓴다', ai: '지표 이상치 탐지 + 원인 가설 + 보고서 초안' },
      { problem: '수율 하락 원인을 경험에 의존해 추적한다', ai: '데이터·현장 메모 기반 원인 가설과 확인 방법' },
      { problem: '설비 고장은 터진 뒤에야 알고, 전조 신호는 센서 로그에 묻혀 있다', ai: '기준선 대비 이탈 탐지 + 과거 고장 전조에서 경보 기준 제안' },
    ],
    split: {
      code: '지표 계산, 이상치·기준선 이탈 탐지, 고장 전조 추출',
      ai: '원인 가설, 정비 계획·경보 기준 제안, 보고서 초안',
      human: '현장 확인과 조치·정비 시점 결정',
    },
    tools: [
      { id: 'production', name: '생산지표 분석·보고서', desc: '생산 CSV → 이상치 탐지(코드) → 원인 가설·보고서 초안(AI)' },
      { id: 'equipment', name: '설비 이상 진단', desc: '설비 센서 CSV → 이상 징후·고장 전조 탐지(코드) → 정비 우선순위·경보 기준 제안(AI)' },
    ],
  },
  {
    id: 'qc',
    name: '품질관리',
    where: '공장 (음성 등)',
    mission: '검사·분석으로 제품을 안정시키고, 부적합을 처리하며, 품질 관련 법규 변화를 따라간다.',
    flow: [
      { name: '입고 검사', desc: '원료·포장재 규격과 성적서(COA)를 확인한다' },
      { name: '공정 중 검사', desc: '중량·염도·pH·금속검출 등 관리 항목을 측정한다' },
      { name: '완제품 검사·출하 판정', desc: '검사 수치의 이상 징후를 보고 합격·보류를 정한다', tool: 'inspection' },
      { name: '부적합 처리', desc: '격리·재작업·폐기를 정하고 재발 방지를 기록한다', tool: 'ncr' },
      { name: '품질 분석', desc: '관리도·공정능력으로 규격 안의 서서히 나빠지는 변화를 찾는다', tool: 'inspection' },
      { name: '개정 법규 모니터링', desc: '고시 개정이 자사 품목에 미치는 영향을 판단한다', tool: 'regulation' },
    ],
    problems: [
      { problem: '검사 수치는 합격·불합격만 보고, 규격 안에서 서서히 나빠지는 변화를 놓친다', ai: '관리도·Cpk로 이상 탐지 + "이 추세면 N일 뒤 규격 도달" 예측' },
      { problem: '부적합 보고서 작성이 번거롭고, 현장 메모는 짧고 불완전하다', ai: '메모 → 표준 양식 초안 + 현장에 되물을 질문 + 메모 인용 검증' },
      { problem: '개정 법규를 사람이 찾아 읽고 영향도를 판단한다', ai: '조문 요약 + 품목별 영향도 + 조치 항목 (원문 인용 검증)' },
    ],
    split: {
      code: '관리도·Cpk·추세 계산, 메모·조문 인용을 원문과 글자 단위로 대조',
      ai: '이상 징후 해석·원인 추정, 보고서 초안·5Why, 조문 영향도 판단',
      human: '합격·보류 판정, 부적합 처분, 법무·규제 최종 판단',
    },
    tools: [
      { id: 'inspection', name: '검사 데이터 이상 탐지', desc: '검사 성적 CSV → 관리도·Cpk·추세 계산(코드) → 이상 해석·조치 제안(AI)' },
      { id: 'ncr', name: '부적합 보고서 초안', desc: '현장 메모 → 표준 양식 초안·되물을 질문(AI) · 메모 인용은 코드가 원문과 대조' },
      { id: 'regulation', name: '법규 개정 영향도 분석', desc: '개정 조문 + 자사 품목 → 영향 품목·조치 (인용문은 코드가 원문과 대조)' },
    ],
  },
  {
    id: 'qa',
    name: '품질보증',
    where: '본사 (서울)',
    mission: '공장·제품 전반의 품질을 보증하고, 클레임과 협력업체를 관리한다.',
    flow: [
      { name: '클레임 접수·분류', desc: '유형과 심각도를 정하고 건강 위해 여부를 가린다', tool: 'claim' },
      { name: '원인 조사 지시', desc: '로트·공정·기록 기준으로 조사 항목을 내린다', tool: 'claim' },
      { name: '고객 회신', desc: '원인을 단정하지 않고 사과·조치·후속을 안내한다', tool: 'claim' },
      { name: '공장 위생점검', desc: '반복 지적과 기한 지난 시정조치를 찾아 다음 점검 중점을 정한다', tool: 'hygiene' },
      { name: '표시사항 검토', desc: '알레르기·영양성분 표시의 법규 적합성을 본다' },
      { name: '협력업체 관리', desc: '품질 이슈를 업체에 알리고 조사·시정조치를 요청한다', tool: 'supplier' },
    ],
    problems: [
      { problem: '클레임 분류·원인 조사 항목 정리·회신문 작성에 시간이 든다', ai: '유형·심각도 분류 + 조사 항목 + 회신 초안' },
      { problem: '심각 클레임(이물·알레르기)의 초동 대응이 사람마다 다르다', ai: '즉시 조치 체크리스트와 기관 보고 검토 알림' },
      { problem: '위생점검 지적이 공장마다 반복되는데, 이력이 엑셀에 흩어져 반복·기한 초과를 놓친다', ai: '반복 지적·기한 초과·공통 문제 자동 집계(코드) + 원인 추정·다음 점검 중점·보고서(AI)' },
      { problem: '협력업체에 이슈를 알리는 문서는 귀책을 단정하거나 근거·과거 이력이 빠지기 쉽다', ai: '사실·요청·기한을 갖춘 공문 초안 + 책임 단정 표현 검사 + 업체 기록 기반 이력 인용' },
    ],
    split: {
      code: '위생점검 반복·기한 초과 집계, 메모 인용·업체 이력 대조, 책임 암시 표현 검사',
      ai: '분류·회신 초안, 공문 구성(현황·요청·기한), 발송 전 확인 사항 제안',
      human: '고객 응대, 회수·기관 보고 결정, 공문 최종 검토와 발송',
    },
    tools: [
      { id: 'claim', name: '클레임 분류·회신 초안', desc: '클레임 접수문 → 유형·심각도·조사 항목·회신 초안' },
      { id: 'hygiene', name: '위생점검 분석', desc: '점검 기록 CSV → 반복 지적·기한 초과·공통 문제 집계(코드) → 원인 추정·다음 점검 중점·보고서(AI)' },
      { id: 'supplier', name: '협력업체 통보서 초안', desc: '상황 메모 + 업체 기록 → 공문 초안·요청 자료 · 인용·이력은 코드가 대조, 책임 단정 표현은 경고' },
    ],
  },
];
