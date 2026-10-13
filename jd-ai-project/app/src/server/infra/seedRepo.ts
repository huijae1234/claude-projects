import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  type Claim,
  ClaimSchema,
  type NcrMemo,
  NcrMemoSchema,
  type Product,
  ProductSchema,
  type Regulation,
  RegulationSchema,
  type Supplier,
  SupplierCaseSchema,
  SupplierSchema,
  type SupplierCase,
} from '../domain/seed';

export class SeedRepo {
  constructor(private readonly dir: string) {}

  private async json<T>(file: string, schema: z.ZodType<T>): Promise<T[]> {
    const raw = await readFile(path.join(this.dir, file), 'utf8');
    return z.array(schema).parse(JSON.parse(raw));
  }

  products = (): Promise<Product[]> => this.json('products.json', ProductSchema);
  regulations = (): Promise<Regulation[]> => this.json('regulations.json', RegulationSchema);
  claims = (): Promise<Claim[]> => this.json('claims.json', ClaimSchema);
  suppliers = (): Promise<Supplier[]> => this.json('suppliers.json', SupplierSchema);
  supplierCases = (): Promise<SupplierCase[]> => this.json('supplier_cases.json', SupplierCaseSchema);
  ncrMemos = (): Promise<NcrMemo[]> => this.json('ncr_memos.json', NcrMemoSchema);
  productionCsv = (): Promise<string> => readFile(path.join(this.dir, 'production.csv'), 'utf8');
}
