import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { LlmClient } from './application/llm';
import { withRequestSignal } from './application/requestContext';
import { type AppMode, type DataSource, createCoreApp } from './core';
import { SeedRepo } from './infra/seedRepo';

export type { DataSource } from './core';

export interface AppDeps {
  llm: LlmClient;
  seedDir: string;
  /** 샘플 CSV 폴더 (기본: seedDir 옆의 sample-data/data) */
  sampleDir?: string;
  /** 화면에 표시할 실행 모드 (데모 서버는 'demo') */
  mode?: AppMode;
}

/** 파일에서 시드·샘플을 읽는 데이터 소스 (Node 전용) */
export function fileDataSource(seedDir: string, sampleDir?: string): DataSource {
  const repo = new SeedRepo(seedDir);
  const samples = sampleDir ?? path.join(seedDir, '..', '..', 'sample-data', 'data');
  return {
    products: repo.products,
    regulations: repo.regulations,
    claims: repo.claims,
    ncrMemos: repo.ncrMemos,
    suppliers: repo.suppliers,
    supplierCases: repo.supplierCases,
    productionCsv: repo.productionCsv,
    sample: async (name) => {
      try {
        return await readFile(path.join(samples, name), 'utf8');
      } catch {
        return null;
      }
    },
  };
}

/** Node 서버용 앱: 파일 데이터 + 요청 취소 신호를 LLM 호출까지 전달 */
export function createApp({ llm, seedDir, sampleDir, mode = 'live' }: AppDeps) {
  return createCoreApp({ llm, source: fileDataSource(seedDir, sampleDir), mode, wrapTool: withRequestSignal });
}
