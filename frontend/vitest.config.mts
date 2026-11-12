import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Lightweight unit/component test setup (Vitest + React Testing Library) —
 * deliberately not Playwright/E2E: no browser is available in this
 * environment to run or debug one interactively, so E2E coverage for the
 * named critical journeys is a documented boundary instead (see the final
 * report's Testing section), not something faked with an unmaintained suite
 * nobody can actually run here.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
