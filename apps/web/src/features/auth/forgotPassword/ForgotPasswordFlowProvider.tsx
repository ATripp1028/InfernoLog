// Context for the forgot-password flow, mirroring SignUpFlowProvider. Mounted
// by ForgotPasswordPage, so the code and new password it holds last exactly as
// long as the page.

import { createContext, useContext, type ReactNode } from 'react'
import { useForgotPasswordFlowState } from './useForgotPasswordFlowState'

type ForgotPasswordFlowValue = ReturnType<typeof useForgotPasswordFlowState>

const ForgotPasswordFlowContext = createContext<ForgotPasswordFlowValue | null>(
  null
)

/**
 * Holds the forgot-password step machine for one visit to the page.
 */
export function ForgotPasswordFlowProvider({
  children,
}: {
  children: ReactNode
}) {
  const value = useForgotPasswordFlowState()
  return (
    <ForgotPasswordFlowContext.Provider value={value}>
      {children}
    </ForgotPasswordFlowContext.Provider>
  )
}

/**
 * The forgot-password flow. Throws outside a {@link ForgotPasswordFlowProvider}.
 */
export function useForgotPasswordFlow(): ForgotPasswordFlowValue {
  const ctx = useContext(ForgotPasswordFlowContext)
  if (!ctx) {
    throw new Error(
      'useForgotPasswordFlow must be used within a ForgotPasswordFlowProvider'
    )
  }
  return ctx
}
