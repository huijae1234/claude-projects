import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viewportScrollFix } from './scripts/artifact-plugins.ts';
import { viteSingleFile } from 'vite-plugin-singlefile';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** 아티팩트용 빌드: 서버 없이 도는 화면을 HTML 파일 하나로 묶는다. */
export default defineConfig({
  root: here('./src/static'),
  plugins: [react(), viteSingleFile(), viewportScrollFix()],
  build: {
    outDir: here('./dist-artifact'),
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 4000,
  },
  server: { port: 4173 },
});
