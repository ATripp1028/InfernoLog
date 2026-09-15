// Context for the add-a-password flow, mirroring the signup flow: the step
// machine lives in useSetPasswordFlowState, and each step reads it through
// useSetPasswordFlow() rather than taking props.

import { createContext, useContext, type ReactNode } from 'react'
import type { MeData } from '@/lib/api/me'
import { useSetPasswordFlowState } from './useSetPasswordFlowState'

type SetPasswordFlowValue = ReturnType<typeof useSetPasswordFlowState>

const SetPasswordFlowContext = createContext<SetPasswordFlowValue | null>(null)

/**
 * Holds the add-a-password step machine while the password block is mounted.
 */
export function SetPasswordFlowProvider({
  me,
  children,
}: {
  me: MeData
  children: ReactNode
}) {
  const value = useSetPasswordFlowState(me)
  return (
    <SetPasswordFlowContext.Provider value={value}>
      {children}
    </SetPasswordFlowContext.Provider>
  )
}

/**
 * The add-a-password flow. Throws outside a {@link SetPasswordFlowProvider}.
 */
export function useSetPasswordFlow(): SetPasswordFlowValue {
  const ctx = useContext(SetPasswordFlowContext)
  if (!ctx) {
    throw new Error(
      'useSetPasswordFlow must be used within a SetPasswordFlowProvider'
    )
  }
  return ctx
}
