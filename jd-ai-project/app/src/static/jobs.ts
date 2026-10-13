import type { DataSource } from '../server/core';
import { analyzeInspection, parseInspectionCsv } from '../server/domain/inspection';
import { REGULATION_EXAMPLE, REGULATION_EXAMPLE_TITLE } from '../web/examples';
import { memoFor } from '../web/ncrMemo';

/** 화면에서 고를 수 있는 샘플 입력 하나 = 화면이 보내는 요청 그대로 */
export interface Job {
  id: string;
  path: string;
  body: unknown;
}

/**
 * 아티팩트에서 "미리 실행한 결과"로 보여줄 요청 목록.
 * 화면이 실제로 보내는 본문과 똑같이 만들어야 같은 지문(질문)이 나온다.
 */
export async function buildJobs(src: DataSource): Promise<Job[]> {
  const need = async (name: string) => {
    const t = await src.sample(name);
    if (t === null) throw new Error(`샘플 없음: ${name}`);
    return t;
  };
  const jobs: Job[] = [];

  jobs.push({ id: 'production:hangyeol', path: '/api/tools/production', body: { csv: await src.productionCsv() } });
  jobs.push({ id: 'production:dairy-meat', path: '/api/tools/production', body: { csv: await need('production_dairy_meat.csv') } });
  jobs.push({ id: 'equipment', path: '/api/tools/equipment', body: { csv: await need('equipment_dairy_meat.csv') } });
  const inspectionCsv = await need('inspection_dairy_meat.csv');
  jobs.push({ id: 'inspection', path: '/api/tools/inspection', body: { csv: inspectionCsv } });
  jobs.push({ id: 'hygiene', path: '/api/tools/hygiene', body: { csv: await need('hygiene_audits.csv') } });

  for (const r of await src.regulations()) jobs.push({ id: `regulation:${r.id}`, path: '/api/tools/regulation', body: { regulation_id: r.id } });
  jobs.push({ id: 'regulation:example', path: '/api/tools/regulation', body: { custom: { title: REGULATION_EXAMPLE_TITLE, text: REGULATION_EXAMPLE } } });

  for (const c of await src.claims()) jobs.push({ id: `claim:${c.id}`, path: '/api/tools/claim', body: { claim_id: c.id } });

  for (const m of await src.ncrMemos()) jobs.push({ id: `ncr:${m.id}`, path: '/api/tools/ncr', body: { text: m.text } });
  // 검사 이상 탐지에서 "부적합 보고서 쓰기"로 넘어오는 메모 (규격 이탈이 있는 항목)
  for (const s of analyzeInspection(parseInspectionCsv(inspectionCsv)).series) {
    if (s.violations.some((v) => v.recent && v.rule === 'oos')) {
      jobs.push({ id: `ncr:from-inspection:${s.key}`, path: '/api/tools/ncr', body: { text: memoFor(s) } });
    }
  }

  // 협력업체: 모든 상황은 기본 설정(조사·시정조치 요청, 5영업일), 두 상황은 문서 성격 3종 모두
  for (const c of await src.supplierCases()) {
    const tones = c.id === 'SC-001' || c.id === 'SC-002' ? ['request_action', 'inform', 'formal_corrective'] : ['request_action'];
    for (const tone of tones) {
      jobs.push({
        id: `supplier:${c.id}:${tone}`,
        path: '/api/tools/supplier_report',
        body: { supplier_id: c.supplier_id, text: c.text, tone, deadline_days: 5 },
      });
    }
  }
  return jobs;
}
