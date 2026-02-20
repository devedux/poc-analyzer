import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

/**
 * Unit test config — no external dependencies required.
 * Excludes integration tests (those need Neo4j).
 * Used by: npm run test:unit, CI unit-tests job.
 */
export default defineConfig(({ mode }) => ({
  test: {
    globals: true,
    environment: 'node',
    env: loadEnv(mode, process.cwd(), ''),
    exclude: [
      '**/node_modules/**',
      '**/*.integration.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__/**'],
    },
  },
}))
