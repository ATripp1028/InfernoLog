// Context for the change-email flow, mirroring the other Settings flows: the
// step machine lives in useChangeEmailFlowState and each step reads it through
// useChangeEmailFlow(). Mounted by ChangeEmailDialog, so everything it holds
// is dropped when the dialog closes.

import { createContext, useContext, type ReactNode } from 'react'
import type { MeData } from '@/lib/api/me'
import { useChangeEmailFlowState } from './useChangeEmailFlowState'

type ChangeEmailFlowValue = ReturnType<typeof useChangeEmailFlowState>

const ChangeEmailFlowContext = createContext<ChangeEmailFlowValue | null>(null)

/**
 * Holds the change-email step machine for one open dialog.
 */
export function ChangeEmailFlowProvider({
  me,
  onClose,
  children,
}: {
  me: MeData
  onClose: () => void
  children: ReactNode
}) {
  const value = useChangeEmailFlowState(me, onClose)
  return (
    <ChangeEmailFlowContext.Provider value={value}>
      {children}
    </ChangeEmailFlowContext.Provider>
  )
}

/**
 * The change-email flow. Throws outside a {@link ChangeEmailFlowProvider}.
 */
export function useChangeEmailFlow(): ChangeEmailFlowValue {
  const ctx = useContext(ChangeEmailFlowContext)
  if (!ctx) {
    throw new Error(
      'useChangeEmailFlow must be used within a ChangeEmailFlowProvider'
    )
  }
  return ctx
}
