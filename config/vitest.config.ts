import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['src/tests/**/*.test.ts', 'src/tests/**/*.test.tsx'],
    environmentMatchGlobs: [
      // Use jsdom for React component tests (.tsx)
      ['src/tests/**/*.test.tsx', 'jsdom'],
      // Use node for other tests (.ts)
      ['src/tests/**/*.test.ts', 'node'],
    ],
    setupFiles: ['./config/vitest.setup.ts'],
  },
})
