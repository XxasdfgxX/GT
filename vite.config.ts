import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    port: 6969,
    strictPort: true,
    proxy: {
      '/rooms': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/ws': { target: 'http://127.0.0.1:8787', ws: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
  },
});
