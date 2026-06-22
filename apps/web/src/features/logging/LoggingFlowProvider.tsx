import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { ExistingCompletion, Level } from '@/lib/api/logging'
import {
  draftFromExistingCompletion,
  emptyDraft,
  type FlowDraft,
  type FlowPath,
  type FlowStep,
  type ResolvedLevel,
} from './types'
import { LoggingModal } from './LoggingModal'

interface FlowState {
  isOpen: boolean
  path: FlowPath | null
  step: FlowStep
  level: Level | null
  existingCompletion: ExistingCompletion | null
  suggestedGddlTier: number | null
  // The numeric level id typed by the user — carried into the manual-entry
  // fallback when the Geometry Dash servers can't be reached.
  manualLevelId: string | null
  // Set by openForEdit: the level the `resolving` step should auto-resolve.
  pendingEditLevelId: string | null
  draft: FlowDraft
}

interface FlowContextValue extends FlowState {
  open: (path: FlowPath) => void
  // Open the flow pre-targeted to an existing level (edit), skipping `find`.
  openForEdit: (levelId: string, path: FlowPath) => void
  close: () => void
  setStep: (step: FlowStep) => void
  patchDraft: (patch: Partial<FlowDraft>) => void
  applyResolved: (resolved: ResolvedLevel) => void
  goManual: (levelId: string, existing: ExistingCompletion | null) => void
  applyManualLevel: (level: Level) => void
}

const firstStepFor: Record<FlowPath, FlowStep> = {
  completion: 'c_basics',
  progress: 'p_core',
  drop: 'd_main',
}

const FlowContext = createContext<FlowContextValue | null>(null)

const CLOSED: FlowState = {
  isOpen: false,
  path: null,
  step: 'find',
  level: null,
  existingCompletion: null,
  suggestedGddlTier: null,
  manualLevelId: null,
  pendingEditLevelId: null,
  draft: emptyDraft(),
}

export function LoggingFlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FlowState>(CLOSED)

  const open = useCallback((path: FlowPath) => {
    setState({ ...CLOSED, draft: emptyDraft(), isOpen: true, path })
  }, [])

  const openForEdit = useCallback((levelId: string, path: FlowPath) => {
    setState({
      ...CLOSED,
      draft: emptyDraft(),
      isOpen: true,
      path,
      step: 'resolving',
      pendingEditLevelId: levelId,
    })
  }, [])

  const close = useCallback(() => {
    setState(CLOSED)
  }, [])

  const setStep = useCallback((step: FlowStep) => {
    setState((s) => ({ ...s, step }))
  }, [])

  const patchDraft = useCallback((patch: Partial<FlowDraft>) => {
    setState((s) => ({ ...s, draft: { ...s.draft, ...patch } }))
  }, [])

  const applyResolved = useCallback((resolved: ResolvedLevel) => {
    setState((s) => {
      const draft =
        s.path === 'completion' && resolved.existingCompletion
          ? draftFromExistingCompletion(resolved.existingCompletion)
          : s.draft
      return {
        ...s,
        level: resolved.level,
        existingCompletion: resolved.existingCompletion,
        suggestedGddlTier: resolved.suggestedGddlTier,
        pendingEditLevelId: null,
        draft,
        step: s.path ? firstStepFor[s.path] : s.step,
      }
    })
  }, [])

  const goManual = useCallback(
    (levelId: string, existing: ExistingCompletion | null) => {
      setState((s) => ({
        ...s,
        manualLevelId: levelId,
        existingCompletion: existing,
        pendingEditLevelId: null,
        step: 'manual',
      }))
    },
    []
  )

  const applyManualLevel = useCallback((level: Level) => {
    setState((s) => {
      const draft =
        s.path === 'completion' && s.existingCompletion
          ? draftFromExistingCompletion(s.existingCompletion)
          : s.draft
      return {
        ...s,
        level,
        draft,
        step: s.path ? firstStepFor[s.path] : s.step,
      }
    })
  }, [])

  const value = useMemo<FlowContextValue>(
    () => ({
      ...state,
      open,
      openForEdit,
      close,
      setStep,
      patchDraft,
      applyResolved,
      goManual,
      applyManualLevel,
    }),
    [
      state,
      open,
      openForEdit,
      close,
      setStep,
      patchDraft,
      applyResolved,
      goManual,
      applyManualLevel,
    ]
  )

  return (
    <FlowContext.Provider value={value}>
      {children}
      <LoggingModal />
    </FlowContext.Provider>
  )
}

export function useLoggingFlow(): FlowContextValue {
  const ctx = useContext(FlowContext)
  if (!ctx) {
    throw new Error('useLoggingFlow must be used within a LoggingFlowProvider')
  }
  return ctx
}
