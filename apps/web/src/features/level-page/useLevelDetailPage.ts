// All non-presentational logic for the user-scoped level page
// (`src/pages/LevelPage.tsx`): the level query, ownership/capability
// derivation, the level-scoped FAB action set, and every modal's open state
// and confirm handler. The page component consumes this and renders.

import { useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Check, Flag, List, Pencil, Trash2, Upload, X } from 'lucide-react'
import { useMe } from '@/lib/api/me'
import { useGoBack } from '@/lib/useGoBack'
import { useLevelPage, useDeleteProgressUpdate } from '@/lib/api/levelPage'
import { useDeleteProgress } from '@/lib/api/log'
import { useSubmitGddlRecord } from '@/lib/api/logging'
import { useLoggingFlow } from '@/context/LoggingFlowContext'
import { ApiError } from '@/lib/api/client'
import { toast } from '@/components/generic/sonner'
import { useFabActions } from '@/context/FabActionsContext'
import { findPrimaryProgressUpdateId } from './primaryEntry'

/**
 * Which of the page's mutually exclusive top-level renders applies.
 * 'ready' still requires `data` and `user` to be present before use — see
 * the page's final guard.
 */
export type LevelDetailStatus =
  | 'loading'
  | 'private'
  | 'not-found'
  | 'error'
  | 'ready'

/**
 * Data, status, and modal state for the level page.
 *
 * Named for the page rather than the query it wraps, since `useLevelPage` is
 * already taken by `lib/api/levelPage.ts`.
 */
export function useLevelDetailPage() {
  const { levelId } = useParams({ from: '/_authenticated/log/$levelId' })
  const navigate = useNavigate()
  const back = useGoBack('/log')
  const me = useMe()
  const deleteProgress = useDeleteProgress()
  const deleteProgressUpdate = useDeleteProgressUpdate(levelId)

  const [pendingDelete, setPendingDelete] = useState(false)
  const [pendingDeleteUpdateId, setPendingDeleteUpdateId] = useState<
    string | null
  >(null)
  const [pendingGddlSubmit, setPendingGddlSubmit] = useState(false)
  const [editRunOpen, setEditRunOpen] = useState(false)
  const [editRunProgressUpdateId, setEditRunProgressUpdateId] = useState<
    string | null
  >(null)
  const [editLevelOpen, setEditLevelOpen] = useState(false)
  const [addToCollectionOpen, setAddToCollectionOpen] = useState(false)
  const submitGddlRecord = useSubmitGddlRecord()
  const { openForEdit } = useLoggingFlow()

  const query = useLevelPage(levelId)

  // Resolve error types before rendering
  const is403 = query.error instanceof ApiError && query.error.status === 403
  const is404 = query.error instanceof ApiError && query.error.status === 404

  function handleDeleteConfirm() {
    deleteProgress.mutate(levelId, {
      onSuccess: () => {
        toast.success('Level deleted')
        setPendingDelete(false)
        void navigate({ to: '/log' })
      },
      onError: () => {
        toast.error('Failed to delete level')
      },
    })
  }

  function handleDeleteEntryConfirm() {
    if (!pendingDeleteUpdateId) return
    deleteProgressUpdate.mutate(pendingDeleteUpdateId, {
      onSuccess: (result) => {
        toast.success('Entry deleted')
        setPendingDeleteUpdateId(null)
        if (result.deletedLevelProgress) void navigate({ to: '/log' })
      },
      onError: () => {
        toast.error('Failed to delete entry')
      },
    })
  }

  // FAB's "Edit this entry" — resolves the primary entry (completion-first,
  // else newest) since the FAB isn't scoped to any one Timeline card. Uses
  // `query.data` directly since this runs before the page's loading/error
  // branches, same reason `isOwner`/`hasCompletion` below do.
  function handleEditRun() {
    if (!query.data) return
    const id = findPrimaryProgressUpdateId(query.data)
    if (!id) return
    setEditRunProgressUpdateId(id)
    setEditRunOpen(true)
  }

  function openEditRun(progressUpdateId: string) {
    setEditRunProgressUpdateId(progressUpdateId)
    setEditRunOpen(true)
  }

  function closeEditRun() {
    setEditRunOpen(false)
    setEditRunProgressUpdateId(null)
  }

  function handleGddlSubmitConfirm() {
    submitGddlRecord.mutate(levelId, {
      onSuccess: () => {
        toast.success('Submitted to GDDL')
        setPendingGddlSubmit(false)
      },
      onError: () => toast.error('Failed to submit to GDDL'),
    })
  }

  // Computed with optional chaining (rather than off a narrowed `data`) so
  // this — and the useFabActions call — can run unconditionally, before the
  // page's loading/error branches.
  const isOwner = query.data?.levelProgressId != null
  const hasCompletion =
    query.data?.progressUpdates.some((u) => u.kind === 'COMPLETION') ?? false
  const canSubmitToGddl =
    isOwner && hasCompletion && (me.data?.hasGddlApiKey ?? false)

  // FAB — shown for owned entries; falls back to the default (logging)
  // actions for everyone else. Delete is listed farthest from the FAB.
  useFabActions(
    isOwner
      ? [
          {
            key: 'edit',
            label: 'Edit this entry',
            icon: Pencil,
            onClick: handleEditRun,
          },
          // A level can only hold one completion — once it's beaten there's
          // nothing new left to log.
          ...(!hasCompletion
            ? [
                {
                  key: 'log-completion',
                  label: 'Log a completion',
                  icon: Check,
                  onClick: () => openForEdit(levelId, 'completion'),
                },
                {
                  key: 'log-progress',
                  label: 'Log progress',
                  icon: Flag,
                  onClick: () => openForEdit(levelId, 'progress'),
                },
                {
                  key: 'log-drop',
                  label: 'Drop this level',
                  icon: X,
                  onClick: () => openForEdit(levelId, 'drop'),
                },
              ]
            : []),
          {
            key: 'add-collection',
            label: 'Add to a Collection',
            icon: List,
            onClick: () => setAddToCollectionOpen(true),
          },
          ...(canSubmitToGddl
            ? [
                {
                  key: 'gddl-submit',
                  label: 'Submit to GDDL',
                  icon: Upload,
                  onClick: () => setPendingGddlSubmit(true),
                },
              ]
            : []),
          {
            key: 'delete',
            label: 'Delete this level',
            icon: Trash2,
            danger: true,
            onClick: () => setPendingDelete(true),
          },
        ]
      : null
  )

  const status: LevelDetailStatus =
    me.isPending || (query.isPending && !is403 && !is404)
      ? 'loading'
      : is403
        ? 'private'
        : is404
          ? 'not-found'
          : query.error && !query.data
            ? 'error'
            : 'ready'

  const data = query.data

  return {
    levelId,
    back,
    status,
    data,
    user: me.data,

    // Derived
    isOwner,
    levelName: data?.level.name ?? `Level #${levelId}`,
    hasVideo: !!data?.completionVideoUrl,
    hasGraph: (data?.runsGraph.length ?? 0) > 0,
    totalEntries: data?.progressUpdates.length ?? 0,

    // Edit run modal
    editRunOpen,
    editRunProgressUpdateId,
    openEditRun,
    closeEditRun,

    // Edit level details modal
    editLevelOpen,
    openEditLevel: () => setEditLevelOpen(true),
    closeEditLevel: () => setEditLevelOpen(false),

    // Add to collection
    addToCollectionOpen,
    setAddToCollectionOpen,

    // Delete level
    pendingDelete,
    setPendingDelete,
    handleDeleteConfirm,
    isDeletingLevel: deleteProgress.isPending,

    // Delete a single timeline entry
    pendingDeleteUpdateId,
    setPendingDeleteUpdateId,
    handleDeleteEntryConfirm,
    isDeletingEntry: deleteProgressUpdate.isPending,

    // GDDL submission
    pendingGddlSubmit,
    setPendingGddlSubmit,
    handleGddlSubmitConfirm,
    isSubmittingGddl: submitGddlRecord.isPending,
  }
}
