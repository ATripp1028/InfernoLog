// The logging flow's step machine and draft, split out of
// LoggingFlowProvider so it can be exercised without mounting the modal —
// same shape as the import wizard's useImportFlowState.

import { useCallback, useMemo, useState } from 'react'
import type { ExistingCompletion, Level } from '@/lib/api/logging'
import {
  draftFromExistingCompletion,
  emptyDraft,
  type FlowDraft,
  type FlowPath,
  type FlowStep,
  type ResolvedLevel,
} from './types'

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
  // The level_progress id of the just-submitted completion — handed to the
  // ranking page's "Place now" navigation so it can highlight/scroll to it.
  lastCompletionLevelProgressId: string | null
  // True while the current step has a write in flight. Steps own their own
  // mutations, so the shell can only know it's mid-save if they say so — see
  // `useFlowBusy`. It's what stops the modal being dismissed out from under a
  // save, so it tracks writes only, never searches or lookups.
  isBusy: boolean
  draft: FlowDraft
}

// Every field back to its opening value. Reused by close() and by both open
// paths, so a reopened flow can never inherit the last run's state.
const CLOSED: FlowState = {
  isOpen: false,
  path: null,
  step: 'find',
  level: null,
  existingCompletion: null,
  suggestedGddlTier: null,
  manualLevelId: null,
  pendingEditLevelId: null,
  lastCompletionLevelProgressId: null,
  isBusy: false,
  draft: emptyDraft(),
}

/**
 * The flow state plus every action a step can take against it.
 */
export interface FlowContextValue extends FlowState {
  open: (path: FlowPath) => void
  // Open the flow pre-targeted to an existing level (edit), skipping `find`.
  openForEdit: (levelId: string, path: FlowPath) => void
  close: () => void
  setStep: (step: FlowStep) => void
  setLastCompletion: (levelProgressId: string) => void
  setBusy: (busy: boolean) => void
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

/**
 * Builds the value {@link LoggingFlowProvider} provides: the step machine, the
 * resolved level, and the draft every step reads and patches.
 */
export function useLoggingFlowState(): FlowContextValue {
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

  const setLastCompletion = useCallback((levelProgressId: string) => {
    setState((s) => ({ ...s, lastCompletionLevelProgressId: levelProgressId }))
  }, [])

  const setBusy = useCallback((busy: boolean) => {
    setState((s) => (s.isBusy === busy ? s : { ...s, isBusy: busy }))
  }, [])

  const patchDraft = useCallback((patch: Partial<FlowDraft>) => {
    setState((s) => ({ ...s, draft: { ...s.draft, ...patch } }))
  }, [])

  const applyResolved = useCallback((resolved: ResolvedLevel) => {
    setState((s) => {
      let draft =
        s.path === 'completion' && resolved.existingCompletion
          ? draftFromExistingCompletion(resolved.existingCompletion)
          : s.draft
      // Pre-fill GDDL tier from the suggested tier when starting a new
      // completion (not editing an existing one that already has a tier).
      if (resolved.suggestedGddlTier != null && !draft.userGddlTier) {
        draft = {
          ...draft,
          userGddlTier: String(Math.round(resolved.suggestedGddlTier)),
        }
      }
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

  return useMemo<FlowContextValue>(
    () => ({
      ...state,
      open,
      openForEdit,
      close,
      setStep,
      setLastCompletion,
      setBusy,
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
      setLastCompletion,
      setBusy,
      patchDraft,
      applyResolved,
      goManual,
      applyManualLevel,
    ]
  )
}
