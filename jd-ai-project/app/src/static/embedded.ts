import { z } from 'zod';
import type { DataSource } from '../server/core';
import { ClaimSchema, NcrMemoSchema, ProductSchema, RegulationSchema, SupplierCaseSchema, SupplierSchema } from '../server/domain/seed';
import claims from '../../seed/claims.json';
import ncrMemos from '../../seed/ncr_memos.json';
import products from '../../seed/products.json';
import productionCsv from '../../seed/production.csv?raw';
import regulations from '../../seed/regulations.json';
import supplierCases from '../../seed/supplier_cases.json';
import suppliers from '../../seed/suppliers.json';
import equipmentCsv from '../../../sample-data/data/equipment_dairy_meat.csv?raw';
import hygieneCsv from '../../../sample-data/data/hygiene_audits.csv?raw';
import inspectionCsv from '../../../sample-data/data/inspection_dairy_meat.csv?raw';
import productionDairyCsv from '../../../sample-data/data/production_dairy_meat.csv?raw';

const SAMPLES: Record<string, string> = {
  'production_dairy_meat.csv': productionDairyCsv,
  'equipment_dairy_meat.csv': equipmentCsv,
  'inspection_dairy_meat.csv': inspectionCsv,
  'hygiene_audits.csv': hygieneCsv,
};

/** 페이지 안에 내장한 시드·샘플 데이터 (서버의 파일 데이터와 같은 내용, 같은 검증) */
export const embeddedSource: DataSource = {
  products: async () => z.array(ProductSchema).parse(products),
  regulations: async () => z.array(RegulationSchema).parse(regulations),
  claims: async () => z.array(ClaimSchema).parse(claims),
  ncrMemos: async () => z.array(NcrMemoSchema).parse(ncrMemos),
  suppliers: async () => z.array(SupplierSchema).parse(suppliers),
  supplierCases: async () => z.array(SupplierCaseSchema).parse(supplierCases),
  productionCsv: async () => productionCsv,
  sample: async (name) => SAMPLES[name] ?? null,
};
