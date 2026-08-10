import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useMutationState, useQueryClient } from '@tanstack/react-query'
import { Shell } from '@/components/Shell'
import { PageLoading } from '@/components/PageLoading'
import { useAuth } from '@/context/AuthContext'
import { useMe } from '@/lib/api/me'
import { useRouteGuard } from '@/lib/useRouteGuard'
import { LoggingFlowProvider } from '@/features/logging/LoggingFlowProvider'
import { toast } from '@/components/ui/sonner'
import { rankingQueryKey } from '@/lib/api/ranking'
import { collectionsQueryKey } from '@/lib/api/collections'
import { ImportStatusToast } from '@/features/import/ImportStatusToast'
import { GddlSyncProvider } from '@/features/settings/GddlSyncProvider'

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { isAuthenticated, isAuthInitializing } = useAuth()
  const me = useMe()

  const blockedByAuth = useRouteGuard({
    ready: !isAuthInitializing,
    when: !isAuthenticated,
    to: '/',
  })

  // Only meaningful once me.data has loaded — me.isPending/me.error below are
  // checked first and both imply `when` here can't have been decided yet.
  const blockedByOnboarding = useRouteGuard({
    ready: !isAuthInitializing && isAuthenticated && !!me.data,
    when: !!me.data && !me.data.onboardingCompleted,
    to: '/onboarding',
  })

  if (blockedByAuth) {
    return <PageLoading />
  }

  if (me.isPending) {
    return <PageLoading />
  }

  if (me.error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-danger">
          Something went wrong. Please refresh the page.
        </p>
      </div>
    )
  }

  if (blockedByOnboarding) {
    return <PageLoading />
  }

  return (
    <LoggingFlowProvider>
      <GddlSyncProvider>
        <ReorderSyncWatcher />
        <ImportStatusToast />
        <Shell>
          <Outlet />
        </Shell>
      </GddlSyncProvider>
    </LoggingFlowProvider>
  )
}

// Watches ranking and collection reorder/remove mutation queues. When a batch
// drains (pending count → 0 after having been > 0), invalidates the relevant
// query and shows a "Saved" toast. Errors are already toasted per-mutation;
// the watcher just suppresses the success toast when any error occurred in
// the batch. Lives here (always mounted) so the toast fires regardless of
// which page the user is on when the final API call settles.
const COLLECTION_WATCHED_KEYS = ['collectionReorder', 'removeCollectionEntry']

function ReorderSyncWatcher() {
  const qc = useQueryClient()

  // Track per-batch errors via mutation cache subscription so old errors from
  // previous batches don't bleed into the current batch's outcome.
  const rankingHadError = useRef(false)
  const collectionHadError = useRef(false)
  useEffect(() => {
    return qc.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated') return
      const action = (event as { type: string; action?: { type?: string } })
        .action
      if (action?.type !== 'error') return
      const key = event.mutation.options.mutationKey
      if (!Array.isArray(key)) return
      if (key[0] === 'rankingReorder') rankingHadError.current = true
      if (COLLECTION_WATCHED_KEYS.includes(key[0] as string)) {
        collectionHadError.current = true
      }
    })
  }, [qc])

  const pendingRanking = useMutationState({
    filters: { mutationKey: ['rankingReorder'], status: 'pending' },
  }).length
  const rankingWasActive = useRef(false)
  useEffect(() => {
    if (pendingRanking > 0) {
      rankingWasActive.current = true
      return
    }
    if (!rankingWasActive.current) return
    rankingWasActive.current = false
    if (!rankingHadError.current) toast.success('Ranking saved')
    rankingHadError.current = false
    void qc.invalidateQueries({ queryKey: rankingQueryKey })
  }, [pendingRanking, qc])

  const pendingCollections = useMutationState({
    filters: {
      predicate: (m) =>
        COLLECTION_WATCHED_KEYS.includes(m.options.mutationKey?.[0] as string),
      status: 'pending',
    },
  }).length
  const collectionWasActive = useRef(false)
  useEffect(() => {
    if (pendingCollections > 0) {
      collectionWasActive.current = true
      return
    }
    if (!collectionWasActive.current) return
    collectionWasActive.current = false
    if (collectionHadError.current) {
      toast.error('Could not save collection')
    } else {
      toast.success('Collection saved')
    }
    collectionHadError.current = false
    void qc.invalidateQueries({ queryKey: collectionsQueryKey })
  }, [pendingCollections, qc])

  return null
}
