import type { ReactNode } from 'react'
import { LoggingFlowContext } from '@/context/LoggingFlowContext'
import { useLoggingFlowState } from './useLoggingFlowState'
import { LoggingModal } from './LoggingModal'

/**
 * Holds the logging flow's step machine and draft.
 *
 * Mounted once in the app shell rather than per page, because the FAB opens
 * the flow from anywhere. Steps take zero props and read what they need via
 * `useLoggingFlow()` from {@link LoggingFlowContext}. The state itself lives
 * in {@link useLoggingFlowState}.
 */
export function LoggingFlowProvider({ children }: { children: ReactNode }) {
  const value = useLoggingFlowState()

  return (
    <LoggingFlowContext.Provider value={value}>
      {children}
      <LoggingModal />
    </LoggingFlowContext.Provider>
  )
}
