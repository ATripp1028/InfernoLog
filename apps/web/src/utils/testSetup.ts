// Vitest setup, loaded before every spec file (see vitest.config.ts).

import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Unmount anything rendered by the previous test so hooks run their cleanup
// (useFabActions' unregister, react-query subscriptions) before the next one.
afterEach(cleanup)

// The unit suite must run with no network and no backend. Every `lib/api/`
// hook a spec touches is stubbed, so a real request means a mock was missed —
// fail loudly at the call site rather than hanging until the test times out.
globalThis.fetch = (input: RequestInfo | URL) => {
  throw new Error(
    `Unit tests must not make network requests (attempted: ${String(input)}). ` +
      `Stub the lib/api hook the code under test calls.`
  )
}

// jsdom implements neither, and dnd-kit's sensors touch both on mount.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
