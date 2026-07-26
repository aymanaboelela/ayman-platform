import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * The first DOM test harness in `apps/web` (Plan 3 Task 10). jsdom so hook
 * tests (`use-debounced-reorder.test.ts`) and any future component test can
 * render. The `@/*` alias mirrors `tsconfig.json`'s `paths` so a test can
 * import `@/lib/...` exactly like application code does.
 *
 * `*.test.ts(x)` only — `*.e2e.ts` is Playwright's glob (Plan 7) and
 * `*.spec.ts` is Jest's glob in `apps/api`; the three runners never fight
 * over a file.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.next/**'],
  },
});
