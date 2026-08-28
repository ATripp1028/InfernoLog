import { createContext, useContext, useEffect } from 'react'
import type { FlowContextValue } from '@/features/logging/useLoggingFlowState'

/**
 * The logging flow's public vocabulary — which of the three things is being
 * logged. Re-exported here so a caller that only opens the flow (the log
 * table's row actions, the level pages' FAB) needs nothing from
 * `features/logging` itself.
 */
export type { FlowPath } from '@/features/logging/types'

/**
 * The flow value, or null outside a provider.
 *
 * Lives in `context/` rather than beside the provider because the flow is
 * mounted once in the app shell and read from three features besides logging
 * itself — the log, the level page, and the global level page all open it for
 * editing. `LoggingFlowProvider` (in `features/logging`) is the only thing
 * that writes to it; everything else goes through {@link useLoggingFlow}.
 */
export const LoggingFlowContext = createContext<FlowContextValue | null>(null)

/**
 * The logging flow. Throws outside a `LoggingFlowProvider`.
 */
export function useLoggingFlow(): FlowContextValue {
  const ctx = useContext(LoggingFlowContext)
  if (!ctx) {
    throw new Error('useLoggingFlow must be used within a LoggingFlowProvider')
  }
  return ctx
}

/**
 * Reports a step's in-flight write up to the modal shell, which uses it to
 * refuse dismissal (and fade its X) until the write lands. Call it with the
 * mutation's `isPending` — one line, near the mutation it describes.
 *
 * Pass it writes only. A search or a lookup finishing late is not a reason to
 * trap the user in the modal; a half-written completion is.
 *
 * Only one step is mounted at a time, so a single flag is enough. The cleanup
 * clears it on unmount, which is what keeps a step that navigates away
 * mid-request from leaving the modal permanently sealed.
 */
export function useFlowBusy(busy: boolean): void {
  const { setBusy } = useLoggingFlow()
  useEffect(() => {
    setBusy(busy)
    return () => setBusy(false)
  }, [busy, setBusy])
}
