// Context for the spreadsheet import flow, mirroring LoggingFlowProvider:
// the step machine lives here (in useImportFlowState) and every step reads
// what it needs through useImportFlow() instead of being handed props by the
// wizard shell.
//
// Unlike the logging flow, this provider is NOT app-global — ImportWizard
// mounts it, so the flow's state is scoped to one open wizard and resets when
// it unmounts. That is what makes closing and reopening the wizard start
// clean without an explicit reset.

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { MeData } from '@/lib/api/me'
import { useImportFlowState } from './useImportFlowState'

interface ImportFlowContextValue extends ReturnType<typeof useImportFlowState> {
  // Dismisses the wizard. Owned by whoever mounted it (the settings drawer,
  // or onboarding's Continue) — the flow itself never decides what closing
  // means, it just calls this.
  close: () => void
  // Onboarding: a brand-new account can't already have completions, so the
  // conflict-check round trip and its steps are skipped entirely.
  skipConflictCheck: boolean
}

const ImportFlowContext = createContext<ImportFlowContextValue | null>(null)

export function ImportFlowProvider({
  me,
  onClose,
  skipConflictCheck,
  children,
}: {
  me: MeData
  onClose: () => void
  skipConflictCheck: boolean
  children: ReactNode
}) {
  const state = useImportFlowState({ me, skipConflictCheck })

  const value = useMemo<ImportFlowContextValue>(
    () => ({ ...state, close: onClose, skipConflictCheck }),
    [state, onClose, skipConflictCheck]
  )

  return (
    <ImportFlowContext.Provider value={value}>
      {children}
    </ImportFlowContext.Provider>
  )
}

export function useImportFlow(): ImportFlowContextValue {
  const ctx = useContext(ImportFlowContext)
  if (!ctx) {
    throw new Error('useImportFlow must be used within an ImportFlowProvider')
  }
  return ctx
}
