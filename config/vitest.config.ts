import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, '../src/main'),
      '@renderer': path.resolve(__dirname, '../src/renderer'),
      '@shared': path.resolve(__dirname, '../src/shared'),
    },
  },
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
