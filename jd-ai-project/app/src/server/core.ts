import { type Context, Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { type AppError, ErrorCode } from '../shared/result';
import type { LlmClient } from './application/llm';
import {
  analyzeProductionTool,
  claimTriageTool,
  equipmentDiagnosisTool,
  hygieneTool,
  inspectionTool,
  ncrDraftTool,
  regulationImpactTool,
  supplierReportTool,
} from './application/tools';
import { analyzeEquipment, parseEquipmentCsv } from './domain/equipment';
import { analyzeHygiene, parseHygieneCsv } from './domain/hygiene';
import { analyzeInspection, parseInspectionCsv } from './domain/inspection';
import { parseRegulationText } from './domain/regulation';
import { type Claim, CsvFormatError, type NcrMemo, type Product, type Regulation, type Supplier, type SupplierCase, parseProductionCsv } from './domain/seed';
import { analyzeProduction } from './domain/stats';

/** 시드·샘플 데이터를 어디서 읽는지. 서버는 파일, 아티팩트는 페이지에 내장된 데이터를 쓴다. */
export interface DataSource {
  products(): Promise<Product[]>;
  regulations(): Promise<Regulation[]>;
  claims(): Promise<Claim[]>;
  ncrMemos(): Promise<NcrMemo[]>;
  suppliers(): Promise<Supplier[]>;
  supplierCases(): Promise<SupplierCase[]>;
  productionCsv(): Promise<string>;
  /** 샘플 CSV 내용. 없으면 null */
  sample(name: string): Promise<string | null>;
}

export type AppMode = 'live' | 'demo' | 'artifact';

export interface CoreDeps {
  llm: LlmClient;
  source: DataSource;
  /** 화면에 표시할 실행 모드 */
  mode?: AppMode;
  /** 도구 요청마다 감쌀 함수 (서버: 요청 취소 신호를 LLM 호출까지 전달) */
  wrapTool?: (signal: AbortSignal, next: () => Promise<void>) => Promise<void>;
}

const STATUS: Record<string, ContentfulStatusCode> = {
  [ErrorCode.Validation]: 400,
  [ErrorCode.InvalidId]: 400,
  [ErrorCode.NotFound]: 404,
  [ErrorCode.LlmCallFailed]: 502,
  [ErrorCode.LlmInvalidOutput]: 502,
  [ErrorCode.Storage]: 500,
};

const fail = (e: AppError) => ({ error: e });

const MAX_CSV_CHARS = 8_000_000;
const CsvBody = z.object({ csv: z.string().min(1).optional() });

/** 샘플 CSV 목록. 파일명은 이 목록에 있는 것만 내려준다 (경로 이탈 방지). */
const SAMPLES = [
  { name: 'production_dairy_meat.csv', tool: 'production', label: '유가공·육가공 6월 생산 실적' },
  { name: 'equipment_dairy_meat.csv', tool: 'equipment', label: '유가공·육가공 설비 센서 6개월' },
  { name: 'inspection_dairy_meat.csv', tool: 'inspection', label: '유가공·육가공 검사 성적 3개월' },
  { name: 'hygiene_audits.csv', tool: 'hygiene', label: '3개 공장 위생점검 기록 6개월' },
] as const;

const csvTooBig = (csv?: string) => (csv && csv.length > MAX_CSV_CHARS ? `파일이 너무 큽니다(최대 약 ${MAX_CSV_CHARS / 1_000_000}MB).` : null);
const csvError = (e: unknown) =>
  e instanceof CsvFormatError ? e.message : `CSV를 읽을 수 없습니다: ${String(e).slice(0, 200)}`;
const RegulationBody = z
  .object({
    regulation_id: z.string().min(1).optional(),
    /** 샘플 대신 사용자가 붙여넣은 조문 */
    custom: z.object({ title: z.string().max(200).optional(), effective_date: z.string().optional(), text: z.string() }).optional(),
  })
  .refine((b) => b.regulation_id || b.custom, { message: 'regulation_id 또는 custom(붙여넣은 조문)이 필요합니다' });
const SupplierBody = z.object({
  case_id: z.string().optional(),
  supplier_id: z.string().optional(),
  text: z.string().min(1).max(5000).optional(),
  tone: z.enum(['inform', 'request_action', 'formal_corrective']).default('request_action'),
  deadline_days: z.number().int().min(1).max(30).default(5),
});
const NcrBody = z.object({ memo_id: z.string().optional(), text: z.string().min(1).max(5000).optional() });
const ClaimBody = z.object({
  claim_id: z.string().optional(),
  text: z.string().min(1).optional(),
  product_id: z.string().optional(),
  lot: z.string().optional(),
});

/** 런타임에 독립적인 HTTP 앱. Node 서버와 아티팩트(브라우저) 양쪽에서 같은 코드로 돈다. */
export function createCoreApp({ llm, source, mode = 'live', wrapTool }: CoreDeps) {
  const app = new Hono();
  const seed = source;

  if (wrapTool) app.use('/api/tools/*', (c, next) => wrapTool(c.req.raw.signal, next));

  app.get('/api/health', (c) => c.json({ status: 'ok', mode }));

  app.get('/api/seed/products', async (c) => c.json(await seed.products()));
  app.get('/api/seed/regulations', async (c) => c.json(await seed.regulations()));
  app.get('/api/seed/claims', async (c) => c.json(await seed.claims()));
  app.get('/api/seed/production', async (c) => c.text(await seed.productionCsv()));
  app.get('/api/seed/ncr_memos', async (c) => c.json(await seed.ncrMemos()));
  app.get('/api/seed/suppliers', async (c) => c.json(await seed.suppliers()));
  app.get('/api/seed/supplier_cases', async (c) => c.json(await seed.supplierCases()));

  app.get('/api/samples', async (c) => {
    const available = await Promise.all(SAMPLES.map(async (s) => ((await source.sample(s.name)) !== null ? s : null)));
    return c.json(available.filter(Boolean));
  });
  app.get('/api/samples/:name', async (c) => {
    const sample = SAMPLES.find((s) => s.name === c.req.param('name'));
    if (!sample) return c.json(fail({ code: ErrorCode.NotFound, message: '없는 샘플입니다' }), 404);
    const text = await source.sample(sample.name);
    if (text === null) return c.json(fail({ code: ErrorCode.NotFound, message: '샘플 파일이 없습니다. scripts/gen-sample-data.ts를 실행하세요.' }), 404);
    return c.text(text);
  });

  /** CSV 본문을 검증하고 파싱한다. 실패하면 바로 돌려줄 응답(error)을 함께 준다. */
  const readRows = async <T>(
    c: Context,
    parse: (csv: string) => T[],
    loadDefault: () => Promise<string>,
  ): Promise<{ rows: T[] } | { error: Response }> => {
    const body = CsvBody.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return { error: c.json(fail({ code: ErrorCode.Validation, message: z.prettifyError(body.error) }), 400) };
    const tooBig = csvTooBig(body.data.csv);
    if (tooBig) return { error: c.json(fail({ code: ErrorCode.Validation, message: tooBig }), 400) };
    try {
      return { rows: parse(body.data.csv ?? (await loadDefault())) };
    } catch (e) {
      return { error: c.json(fail({ code: ErrorCode.Validation, message: csvError(e) }), 400) };
    }
  };
  const sample = (name: string) => async () => {
    const text = await source.sample(name);
    if (text === null) throw new CsvFormatError(`기본 샘플(${name})을 찾을 수 없습니다. CSV를 직접 올려 주세요.`);
    return text;
  };
  const reply = <T>(c: Context, r: { ok: true; value: T } | { ok: false; error: AppError }) =>
    r.ok ? c.json(r.value) : c.json(fail(r.error), STATUS[r.error.code] ?? 500);

  // 데이터 도구는 "미리보기"(코드 계산만, 즉시)와 "전체"(AI 해석 포함, 수십 초)를 나눠 제공한다.
  // 화면은 둘을 동시에 요청해서 코드 계산 결과를 먼저 보여준다.
  app.post('/api/tools/production/preview', async (c) => {
    const r = await readRows(c, parseProductionCsv, () => seed.productionCsv());
    return 'error' in r ? r.error : c.json({ stats: analyzeProduction(r.rows) });
  });
  app.post('/api/tools/production', async (c) => {
    const r = await readRows(c, parseProductionCsv, () => seed.productionCsv());
    return 'error' in r ? r.error : reply(c, await analyzeProductionTool(llm, r.rows));
  });

  app.post('/api/tools/equipment/preview', async (c) => {
    const r = await readRows(c, parseEquipmentCsv, sample('equipment_dairy_meat.csv'));
    return 'error' in r ? r.error : c.json({ analysis: analyzeEquipment(r.rows) });
  });
  app.post('/api/tools/equipment', async (c) => {
    const r = await readRows(c, parseEquipmentCsv, sample('equipment_dairy_meat.csv'));
    return 'error' in r ? r.error : reply(c, await equipmentDiagnosisTool(llm, r.rows));
  });

  app.post('/api/tools/inspection/preview', async (c) => {
    const r = await readRows(c, parseInspectionCsv, sample('inspection_dairy_meat.csv'));
    return 'error' in r ? r.error : c.json({ analysis: analyzeInspection(r.rows) });
  });
  app.post('/api/tools/inspection', async (c) => {
    const r = await readRows(c, parseInspectionCsv, sample('inspection_dairy_meat.csv'));
    return 'error' in r ? r.error : reply(c, await inspectionTool(llm, r.rows));
  });

  app.post('/api/tools/hygiene/preview', async (c) => {
    const r = await readRows(c, parseHygieneCsv, sample('hygiene_audits.csv'));
    return 'error' in r ? r.error : c.json({ analysis: analyzeHygiene(r.rows) });
  });
  app.post('/api/tools/hygiene', async (c) => {
    const r = await readRows(c, parseHygieneCsv, sample('hygiene_audits.csv'));
    return 'error' in r ? r.error : reply(c, await hygieneTool(llm, r.rows));
  });

  app.post('/api/tools/supplier_report', async (c) => {
    const body = SupplierBody.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json(fail({ code: ErrorCode.Validation, message: z.prettifyError(body.error) }), 400);
    const { case_id, text, tone, deadline_days } = body.data;

    let supplierId = body.data.supplier_id;
    let memo = text?.trim();
    if (case_id) {
      const found = (await seed.supplierCases()).find((x) => x.id === case_id);
      if (!found) return c.json(fail({ code: ErrorCode.NotFound, message: `상황 ${case_id} 없음` }), 404);
      supplierId ??= found.supplier_id;
      memo ||= found.text;
    }
    if (!supplierId) return c.json(fail({ code: ErrorCode.Validation, message: 'supplier_id 또는 case_id가 필요합니다' }), 400);
    if (!memo) return c.json(fail({ code: ErrorCode.Validation, message: '상황 메모(text) 또는 case_id가 필요합니다' }), 400);
    const supplier = (await seed.suppliers()).find((x) => x.id === supplierId);
    if (!supplier) return c.json(fail({ code: ErrorCode.NotFound, message: `협력업체 ${supplierId} 없음` }), 404);

    const r = await supplierReportTool(llm, { supplier, memo, tone, deadlineDays: deadline_days });
    return r.ok ? c.json(r.value) : c.json(fail(r.error), STATUS[r.error.code] ?? 500);
  });

  app.post('/api/tools/ncr', async (c) => {
    const body = NcrBody.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json(fail({ code: ErrorCode.Validation, message: z.prettifyError(body.error) }), 400);

    let memo = body.data.text?.trim();
    if (!memo && body.data.memo_id) {
      const found = (await seed.ncrMemos()).find((m) => m.id === body.data.memo_id);
      if (!found) return c.json(fail({ code: ErrorCode.NotFound, message: `메모 ${body.data.memo_id} 없음` }), 404);
      memo = found.text;
    }
    if (!memo) return c.json(fail({ code: ErrorCode.Validation, message: 'memo_id 또는 text가 필요합니다' }), 400);

    const r = await ncrDraftTool(llm, memo);
    return r.ok ? c.json(r.value) : c.json(fail(r.error), STATUS[r.error.code] ?? 500);
  });

  app.post('/api/tools/regulation', async (c) => {
    const body = RegulationBody.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json(fail({ code: ErrorCode.Validation, message: z.prettifyError(body.error) }), 400);

    let regulation;
    if (body.data.custom) {
      try {
        regulation = parseRegulationText(body.data.custom);
      } catch (e) {
        return c.json(fail({ code: ErrorCode.Validation, message: csvError(e) }), 400);
      }
    } else {
      regulation = (await seed.regulations()).find((r) => r.id === body.data.regulation_id);
      if (!regulation) {
        return c.json(fail({ code: ErrorCode.NotFound, message: `법규 ${body.data.regulation_id} 없음` }), 404);
      }
    }
    const r = await regulationImpactTool(llm, regulation, await seed.products());
    return r.ok ? c.json(r.value) : c.json(fail(r.error), STATUS[r.error.code] ?? 500);
  });

  app.post('/api/tools/claim', async (c) => {
    const body = ClaimBody.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json(fail({ code: ErrorCode.Validation, message: z.prettifyError(body.error) }), 400);

    const { claim_id, text, product_id, lot } = body.data;
    const products = await seed.products();
    let claim: { text: string; lot?: string; channel?: string };
    let productId = product_id;

    if (claim_id) {
      const found = (await seed.claims()).find((x) => x.id === claim_id);
      if (!found) return c.json(fail({ code: ErrorCode.NotFound, message: `클레임 ${claim_id} 없음` }), 404);
      claim = found;
      productId ??= found.product_id;
    } else if (text) {
      claim = { text, lot };
    } else {
      return c.json(fail({ code: ErrorCode.Validation, message: 'claim_id 또는 text가 필요합니다' }), 400);
    }

    const r = await claimTriageTool(llm, claim, products.find((p) => p.id === productId));
    return r.ok ? c.json(r.value) : c.json(fail(r.error), STATUS[r.error.code] ?? 500);
  });

  return app;
}
