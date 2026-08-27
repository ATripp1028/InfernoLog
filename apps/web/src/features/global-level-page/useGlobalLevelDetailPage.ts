// All non-presentational logic for the community-facing global level page
// (`src/pages/GlobalLevelPage.tsx`): the level resolve query and its error
// classification, the level-scoped FAB action set, and the two collection
// paths (one-tap Want to Beat, plus the full Add to Collection dialog).

import { useMemo, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Check, Flag, List, Star, X } from 'lucide-react'
import {
  useGlobalLevelPage,
  levelPageErrorKind,
  type GlobalLevelPageData,
} from '@/lib/api/globalLevelPage'
import { useGoBack } from '@/lib/useGoBack'
import { useFabActions } from '@/context/FabActionsContext'
import { useLoggingFlow } from '@/features/logging/LoggingFlowProvider'
import {
  useCollections,
  useAddCollectionEntry,
  collectionErrorCode,
} from '@/lib/api/collections'
import {
  ApiError,
  retryAfterSeconds as retryAfterSecondsOf,
} from '@/lib/api/client'
import { toast } from '@/components/generic/sonner'

/**
 * Data and status for the Global Level Page.
 *
 * Named for the page rather than the query it wraps, since `useGlobalLevelPage`
 * is already taken by `lib/api/globalLevelPage.ts`.
 */
export function useGlobalLevelDetailPage() {
  const { levelId } = useParams({ from: '/_authenticated/levels/$levelId' })
  const navigate = useNavigate()
  const back = useGoBack('/log')
  const { openForEdit } = useLoggingFlow()
  const [addToCollectionOpen, setAddToCollectionOpen] = useState(false)

  const query = useGlobalLevelPage(levelId)
  const level = query.data
  const errorKind = query.error ? levelPageErrorKind(query.error) : null
  // Only meaningful alongside errorKind === 'rate_limited'; the helper falls
  // back to a sane default for every other error, so it needs no guard here.
  const retryAfterSeconds = retryAfterSecondsOf(query.error)

  // Want to Beat is a built-in collection — resolve its id so the FAB can add
  // this level to it in one tap (the API enforces the "unbeaten only" rule).
  const collections = useCollections()
  const wtbId = collections.data?.find((c) => c.type === 'WANT_TO_BEAT')?.id
  const addEntry = useAddCollectionEntry()

  // The subset AddToCollectionDialog needs as its preselected level. Memoized on
  // the resolved level so its identity is stable across unrelated re-renders —
  // an inline object would change every render and re-fire the dialog's reset
  // effect (keyed on preselectedLevel), wiping in-progress selections while open.
  const preselectedLevel = useMemo(
    () => (query.data ? collectionLevel(query.data) : undefined),
    [query.data]
  )

  const handleAddToWantToBeat = () => {
    if (!wtbId) return
    addEntry.mutate(
      { collectionId: wtbId, levelId },
      {
        onSuccess: () => toast.success('Added to Want to Beat'),
        onError: (err) => {
          const code = collectionErrorCode(err)
          toast.error(
            code === 'LEVEL_ALREADY_COMPLETED'
              ? 'Already completed — Want to Beat only holds unbeaten levels'
              : err instanceof ApiError
                ? err.message
                : 'Could not add to Want to Beat'
          )
        },
      }
    )
  }

  // FAB — four logging actions scoped to THIS level, no destructive item
  // (there's nothing to delete on a level the user hasn't logged). Disabled
  // while a resolve is in flight; suppressed entirely on the terminal/retry
  // error states. Logging stays enabled for delisted levels — delisting is a
  // fact about GD's servers, not the user's history.
  const fabDisabled = query.isPending
  useFabActions(
    errorKind
      ? null
      : [
          {
            key: 'log-completion',
            label: 'Log a completion',
            icon: Check,
            disabled: fabDisabled,
            onClick: () => openForEdit(levelId, 'completion'),
          },
          {
            key: 'log-progress',
            label: 'Log progress',
            icon: Flag,
            disabled: fabDisabled,
            onClick: () => openForEdit(levelId, 'progress'),
          },
          {
            key: 'log-drop',
            label: 'Drop this level',
            icon: X,
            disabled: fabDisabled,
            onClick: () => openForEdit(levelId, 'drop'),
          },
          {
            key: 'want-to-beat',
            label: 'Add to Want to Beat',
            icon: Star,
            // Needs the WTB collection id resolved; also pending while an add
            // is in flight so a double-tap can't fire two requests.
            disabled: fabDisabled || !wtbId || addEntry.isPending,
            onClick: handleAddToWantToBeat,
          },
          {
            key: 'add-collection',
            label: 'Add to a Collection',
            icon: List,
            disabled: fabDisabled,
            onClick: () => setAddToCollectionOpen(true),
          },
        ],
    // Mobile FAB sheet context header — the level name, once resolved.
    level ? (level.name ?? `Level #${levelId}`) : undefined
  )

  return {
    levelId,
    back,
    isLoading: query.isPending,
    // 'not_found' / 'unreachable' / anything else — each gets its own render.
    errorKind,
    retryAfterSeconds,
    retry: () => void query.refetch(),
    goToList: () => void navigate({ to: '/log' }),
    level,
    levelName: level?.name ?? `Level #${levelId}`,
    delisted: level?.delistedAt != null,
    preselectedLevel,
    addToCollectionOpen,
    setAddToCollectionOpen,
  }
}

// The subset AddToCollectionDialog needs as its preselected level.
function collectionLevel(level: GlobalLevelPageData) {
  return {
    inGameId: level.inGameId,
    name: level.name,
    creator: level.creator,
    inGameDifficulty: level.inGameDifficulty,
    featured: level.featured,
    epicValue: level.epicValue,
    isRated: level.isRated,
  }
}
