export type SampleTool = 'production' | 'equipment' | 'inspection' | 'hygiene';

export interface SampleEntry {
  key: string;
  tool: SampleTool;
  label: string;
  url: string;
}

/**
 * 샘플 데이터 목록. 서버에서 받아오지 않고 화면에 고정해 두므로,
 * 서버가 느리거나 꺼져 있어도 드롭다운이 비지 않는다 (내용만 서버에서 읽는다).
 * 각 탭의 드롭다운에는 그 탭에 맞는 종류만 보인다.
 */
export const SAMPLE_CATALOG: SampleEntry[] = [
  { key: 'seed-production', tool: 'production', label: '한결식품 9월 생산 실적 (기본)', url: '/api/seed/production' },
  { key: 'production_dairy_meat.csv', tool: 'production', label: '유가공·육가공 6월 생산 실적', url: '/api/samples/production_dairy_meat.csv' },
  { key: 'equipment_dairy_meat.csv', tool: 'equipment', label: '유가공·육가공 설비 센서 6개월', url: '/api/samples/equipment_dairy_meat.csv' },
  { key: 'inspection_dairy_meat.csv', tool: 'inspection', label: '유가공·육가공 검사 성적 3개월', url: '/api/samples/inspection_dairy_meat.csv' },
  { key: 'hygiene_audits.csv', tool: 'hygiene', label: '3개 공장 위생점검 기록 6개월', url: '/api/samples/hygiene_audits.csv' },
];

export const samplesFor = (tool: SampleTool) => SAMPLE_CATALOG.filter((s) => s.tool === tool);
export const defaultKey = (tool: SampleTool) => samplesFor(tool)[0]!.key;
