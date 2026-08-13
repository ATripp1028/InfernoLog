// Vitest setup, loaded before every spec file (see vitest.config.ts).

import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
// Registers the DOM matchers (toBeInTheDocument, toBeDisabled,
// toHaveAttribute, …) and their types. Component specs assert through these
// rather than reaching into the node — `expect(btn).toBeDisabled()` fails with
// the element's actual state, where `expect(btn.disabled).toBe(true)` fails
// with "expected false to be true".
import '@testing-library/jest-dom/vitest'

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

// Pointer capture and scrollIntoView are unimplemented in jsdom, and Radix's
// Select, Popover, Dialog and Slider all call them while opening. Without
// these a component spec that opens any of them dies with
// "target.hasPointerCapture is not a function" from inside Radix, several
// frames away from anything we wrote. Faking them is enough: nothing under
// test reads back a capture, it just must not throw.
//
// Deliberately unconditional assignments — jsdom defines none of these, so
// there is no real implementation to preserve.
Element.prototype.hasPointerCapture = () => false
Element.prototype.setPointerCapture = () => {}
Element.prototype.releasePointerCapture = () => {}
Element.prototype.scrollIntoView = () => {}
