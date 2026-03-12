import { defineConfig } from 'vitest/config'
import path from 'path'

const testConfig = {
  globals: true,
  include: ['src/tests/**/*.test.ts', 'src/tests/**/*.test.tsx'],
  environmentMatchGlobs: [
    ['src/tests/**/*.test.tsx', 'jsdom'],
    ['src/tests/**/*.test.ts', 'node'],
  ],
  setupFiles: ['./config/vitest.setup.ts'],
  reporters: ['default', 'html'],
  outputFile: {
    html: './vitest-report/index.html',
  },
}

export default defineConfig({
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, '../src/main'),
      '@renderer': path.resolve(__dirname, '../src/renderer'),
      '@shared': path.resolve(__dirname, '../src/shared'),
    },
  },
  test: testConfig,
})
