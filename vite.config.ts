import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    port: 6969,
    strictPort: true,
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
