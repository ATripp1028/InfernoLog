import { createContext, useContext, type ReactNode } from 'react'
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
