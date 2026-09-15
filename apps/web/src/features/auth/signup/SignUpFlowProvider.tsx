// Context for the email-and-password signup flow, mirroring ImportFlowProvider:
// the step machine lives in useSignUpFlowState, and each step reads what it
// needs through useSignUpFlow() rather than taking props. Mounted by
// SignUpPage, so the flow — and the password it holds — lasts exactly as long
// as the page.

import { createContext, useContext, type ReactNode } from 'react'
import { useSignUpFlowState } from './useSignUpFlowState'

type SignUpFlowValue = ReturnType<typeof useSignUpFlowState>

const SignUpFlowContext = createContext<SignUpFlowValue | null>(null)

/**
 * Holds the signup step machine for one visit to the page.
 */
export function SignUpFlowProvider({ children }: { children: ReactNode }) {
  const value = useSignUpFlowState()
  return (
    <SignUpFlowContext.Provider value={value}>
      {children}
    </SignUpFlowContext.Provider>
  )
}

/**
 * The signup flow. Throws outside a {@link SignUpFlowProvider}.
 */
export function useSignUpFlow(): SignUpFlowValue {
  const ctx = useContext(SignUpFlowContext)
  if (!ctx) {
    throw new Error('useSignUpFlow must be used within a SignUpFlowProvider')
  }
  return ctx
}
