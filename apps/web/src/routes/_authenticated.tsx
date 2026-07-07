import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { useMutationState, useQueryClient } from '@tanstack/react-query'
import { Shell } from '@/components/Shell'
import { PageLoading } from '@/components/PageLoading'
import { useAuth } from '@/context/AuthContext'
import { useMe } from '@/lib/api/me'
import { LoggingFlowProvider } from '@/features/logging/LoggingFlowProvider'
import { toast } from '@/components/ui/sonner'
import { rankingQueryKey } from '@/lib/api/ranking'
import { collectionsQueryKey } from '@/lib/api/collections'

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { isAuthenticated, isAuthInitializing } = useAuth()
  const navigate = useNavigate()
  const me = useMe()

  useEffect(() => {
    if (!isAuthInitializing && !isAuthenticated) {
      navigate({ to: '/login', replace: true })
    }
  }, [isAuthInitializing, isAuthenticated, navigate])

  useEffect(() => {
    if (
      !isAuthInitializing &&
      isAuthenticated &&
      me.data &&
      !me.data.onboardingCompleted
    ) {
      navigate({ to: '/onboarding', replace: true })
    }
  }, [isAuthInitializing, isAuthenticated, me.data, navigate])

  if (isAuthInitializing || !isAuthenticated) {
    return <PageLoading />
  }

  if (me.isPending) {
    return <PageLoading />
  }

  if (me.error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-red-500">
          Something went wrong. Please refresh the page.
        </p>
      </div>
    )
  }

  if (!me.data?.onboardingCompleted) {
    return <PageLoading />
  }

  return (
    <LoggingFlowProvider>
      <ReorderSyncWatcher />
      <Shell>
        <Outlet />
      </Shell>
    </LoggingFlowProvider>
  )
}

// Watches ranking and collection reorder mutation queues. When a batch drains
// (pending count → 0 after having been > 0), invalidates the relevant query and
// shows a "Saved" toast. Errors are already toasted per-mutation; the watcher
// just suppresses the success toast when any error occurred in the batch.
// Lives here (always mounted) so the toast fires regardless of which page the
// user is on when the final API call settles.
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
      if (key[0] === 'collectionReorder') collectionHadError.current = true
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
    filters: { mutationKey: ['collectionReorder'], status: 'pending' },
  }).length
  const collectionWasActive = useRef(false)
  useEffect(() => {
    if (pendingCollections > 0) {
      collectionWasActive.current = true
      return
    }
    if (!collectionWasActive.current) return
    collectionWasActive.current = false
    if (!collectionHadError.current) toast.success('Collection order saved')
    collectionHadError.current = false
    void qc.invalidateQueries({ queryKey: collectionsQueryKey })
  }, [pendingCollections, qc])

  return null
}
