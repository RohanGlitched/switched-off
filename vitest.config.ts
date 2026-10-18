// Unit tests run in Node with no network. This is its own config so the dev-only /api middleware
// in vite.config.ts (which loads .env into the process) is never part of a test run.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
  },
})
