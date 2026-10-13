import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { type AppError, ErrorCode } from '../shared/result';
import type { LlmClient } from './application/llm';
import {
  analyzeProductionTool,
  claimTriageTool,
  equipmentDiagnosisTool,
  inspectionTool,
  ncrDraftTool,
  regulationImpactTool,
  supplierReportTool,
} from './application/tools';
import { parseEquipmentCsv } from './domain/equipment';
import { parseInspectionCsv } from './domain/inspection';
import { CsvFormatError, parseProductionCsv } from './domain/seed';
import { SeedRepo } from './infra/seedRepo';

export interface AppDeps {
  llm: LlmClient;
  seedDir: string;
  /** 샘플 CSV 폴더 (기본: seedDir 옆의 sample-data/data) */
  sampleDir?: string;
  /** 화면에 표시할 실행 모드 (데모 서버는 'demo') */
  mode?: 'live' | 'demo';
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
] as const;

const csvTooBig = (csv?: string) => (csv && csv.length > MAX_CSV_CHARS ? `파일이 너무 큽니다(최대 약 ${MAX_CSV_CHARS / 1_000_000}MB).` : null);
const csvError = (e: unknown) =>
  e instanceof CsvFormatError ? e.message : `CSV를 읽을 수 없습니다: ${String(e).slice(0, 200)}`;
const RegulationBody = z.object({ regulation_id: z.string().min(1) });
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

export function createApp({ llm, seedDir, sampleDir, mode = 'live' }: AppDeps) {
  const app = new Hono();
  const seed = new SeedRepo(seedDir);
  const samples = sampleDir ?? path.join(seedDir, '..', '..', 'sample-data', 'data');

  app.get('/api/health', (c) => c.json({ status: 'ok', mode }));

  app.get('/api/seed/products', async (c) => c.json(await seed.products()));
  app.get('/api/seed/regulations', async (c) => c.json(await seed.regulations()));
  app.get('/api/seed/claims', async (c) => c.json(await seed.claims()));
  app.get('/api/seed/production', async (c) => c.text(await seed.productionCsv()));
  app.get('/api/seed/ncr_memos', async (c) => c.json(await seed.ncrMemos()));
  app.get('/api/seed/suppliers', async (c) => c.json(await seed.suppliers()));
  app.get('/api/seed/supplier_cases', async (c) => c.json(await seed.supplierCases()));

  app.get('/api/samples', (c) => c.json(SAMPLES.filter((s) => existsSync(path.join(samples, s.name)))));
  app.get('/api/samples/:name', async (c) => {
    const sample = SAMPLES.find((s) => s.name === c.req.param('name'));
    if (!sample) return c.json(fail({ code: ErrorCode.NotFound, message: '없는 샘플입니다' }), 404);
    try {
      return c.text(await readFile(path.join(samples, sample.name), 'utf8'));
    } catch {
      return c.json(fail({ code: ErrorCode.NotFound, message: '샘플 파일이 없습니다. scripts/gen-sample-data.ts를 실행하세요.' }), 404);
    }
  });

  app.post('/api/tools/production', async (c) => {
    const body = CsvBody.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json(fail({ code: ErrorCode.Validation, message: z.prettifyError(body.error) }), 400);
    const tooBig = csvTooBig(body.data.csv);
    if (tooBig) return c.json(fail({ code: ErrorCode.Validation, message: tooBig }), 400);

    let rows;
    try {
      rows = parseProductionCsv(body.data.csv ?? (await seed.productionCsv()));
    } catch (e) {
      return c.json(fail({ code: ErrorCode.Validation, message: csvError(e) }), 400);
    }
    const r = await analyzeProductionTool(llm, rows);
    return r.ok ? c.json(r.value) : c.json(fail(r.error), STATUS[r.error.code] ?? 500);
  });

  app.post('/api/tools/equipment', async (c) => {
    const body = CsvBody.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json(fail({ code: ErrorCode.Validation, message: z.prettifyError(body.error) }), 400);
    const tooBig = csvTooBig(body.data.csv);
    if (tooBig) return c.json(fail({ code: ErrorCode.Validation, message: tooBig }), 400);

    let rows;
    try {
      rows = parseEquipmentCsv(body.data.csv ?? (await readFile(path.join(samples, 'equipment_dairy_meat.csv'), 'utf8')));
    } catch (e) {
      return c.json(fail({ code: ErrorCode.Validation, message: csvError(e) }), 400);
    }
    const r = await equipmentDiagnosisTool(llm, rows);
    return r.ok ? c.json(r.value) : c.json(fail(r.error), STATUS[r.error.code] ?? 500);
  });

  app.post('/api/tools/inspection', async (c) => {
    const body = CsvBody.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json(fail({ code: ErrorCode.Validation, message: z.prettifyError(body.error) }), 400);
    const tooBig = csvTooBig(body.data.csv);
    if (tooBig) return c.json(fail({ code: ErrorCode.Validation, message: tooBig }), 400);

    let rows;
    try {
      rows = parseInspectionCsv(body.data.csv ?? (await readFile(path.join(samples, 'inspection_dairy_meat.csv'), 'utf8')));
    } catch (e) {
      return c.json(fail({ code: ErrorCode.Validation, message: csvError(e) }), 400);
    }
    const r = await inspectionTool(llm, rows);
    return r.ok ? c.json(r.value) : c.json(fail(r.error), STATUS[r.error.code] ?? 500);
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

    const regulation = (await seed.regulations()).find((r) => r.id === body.data.regulation_id);
    if (!regulation) {
      return c.json(fail({ code: ErrorCode.NotFound, message: `법규 ${body.data.regulation_id} 없음` }), 404);
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
