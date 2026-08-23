import { createContext, useContext, useEffect, type ReactNode } from 'react'
import {
  useLoggingFlowState,
  type FlowContextValue,
} from './useLoggingFlowState'
import { LoggingModal } from './LoggingModal'

const FlowContext = createContext<FlowContextValue | null>(null)

/**
 * Holds the logging flow's step machine and draft.
 *
 * Mounted once in the app shell rather than per page, because the FAB opens
 * the flow from anywhere. Steps take zero props and read what they need from
 * this. The state itself lives in {@link useLoggingFlowState}.
 */
export function LoggingFlowProvider({ children }: { children: ReactNode }) {
  const value = useLoggingFlowState()

  return (
    <FlowContext.Provider value={value}>
      {children}
      <LoggingModal />
    </FlowContext.Provider>
  )
}

/**
 * The logging flow. Throws outside a {@link LoggingFlowProvider}.
 */
export function useLoggingFlow(): FlowContextValue {
  const ctx = useContext(FlowContext)
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
