import { defineConfig } from 'vitest/config'
import * as path from 'path'

// Deliberately NOT reusing vite.config.ts: the TanStack Router plugin
// regenerates routeTree.gen.ts on every run, which tests never need.
//
// Tests live in a `tests/` directory beside the file under test — e.g.
// `features/collections/tests/identity.spec.ts` covers
// `features/collections/identity.ts` — so a feature folder reads as its own
// source files first, with the suite tucked underneath.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/tests/*.spec.{ts,tsx}'],
    setupFiles: ['./src/utils/testSetup.ts'],
    // Call history is per-test; spies created with vi.spyOn are also unwound.
    clearMocks: true,
    restoreMocks: true,
    // Dates render through toLocaleDateString, so the runner's zone decides
    // which day a UTC instant falls on: 2026-01-01T02:00Z is Jan 1 in UTC but
    // Dec 31 2025 in the Americas. Pin the zone so a date assertion means the
    // same thing on a laptop and in CI. The clock itself is deliberately NOT
    // faked — nothing under test reads it, and fake timers would interfere
    // with react-query and waitFor.
    env: { TZ: 'UTC' },
  },
})
