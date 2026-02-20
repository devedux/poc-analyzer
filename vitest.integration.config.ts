import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

/**
 * Integration test config — requires a running Neo4j instance.
 *
 * Local:
 *   docker compose up -d
 *   NEO4J_TEST_URI=bolt://localhost:7687 npm run test:integration
 *
 * CI: handled automatically via GitHub Actions services (ephemeral Neo4j).
 *
 * If NEO4J_TEST_URI / NEO4J_URI is not set, all tests skip gracefully.
 */
export default defineConfig(({ mode }) => ({
  test: {
    globals: true,
    environment: 'node',
    env: loadEnv(mode, process.cwd(), ''),
    include: ['src/__tests__/**/*.integration.test.ts'],
    // Integration tests hit a real DB — allow generous timeouts.
    testTimeout: 60_000,
    hookTimeout: 90_000, // beforeAll waits up to 90s for Neo4j to be ready
  },
}))
