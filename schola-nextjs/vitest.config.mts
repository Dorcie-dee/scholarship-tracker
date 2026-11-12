import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    // Frontend component tests need a DOM; backend tests (the vast
    // majority) don't and shouldn't pay for one. `server/lib/test-db.ts`'s
    // DB lifecycle in vitest.setup.ts runs for every file either way —
    // negligible overhead (the binary is cached locally) and keeps one
    // shared setup file instead of a full multi-project workspace split.
    environmentMatchGlobs: [['app/**', 'jsdom']],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './app'),
      '@/server': path.resolve(__dirname, './server'),
    },
  },
});
