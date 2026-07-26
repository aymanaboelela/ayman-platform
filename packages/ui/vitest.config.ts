import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * The first DOM test harness in this package (Plan 3 Task 10). jsdom, not the
 * vitest default `node` environment, because `field.test.tsx` and
 * `input.test.tsx` render real components and assert on the DOM they produce.
 * `*.test.ts(x)` only — `*.spec.ts` is Jest's glob in `apps/api` and the two
 * runners must never both claim the same file.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
  },
});
