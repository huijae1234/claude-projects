import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here('./src/web'),
  plugins: [react()],
  server: {
    host: true, // 같은 와이파이의 다른 기기에서도 접속 가능
    port: 5173,
    proxy: { '/api/': 'http://localhost:8787' },
  },
  build: { outDir: here('./dist-web'), emptyOutDir: true },
});
