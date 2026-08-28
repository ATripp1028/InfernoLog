// Logic for the level half of the edit modals: the level-scoped form (notes,
// ratings, worst fail, coins, GDDL tier, visibility), its reset-on-open sync,
// the community tier hint, and the save payload. `useEditLevelForm` holds all
// of that and is what the merged EditEntryModal composes; `useEditLevelModal`
// wraps it with the mutation the standalone EditLevelModal saves through.

import { useEffect, useState } from 'react'
import { toast } from '@/components/generic/sonner'
import { maxValueError, MAX_GDDL_TIER } from '@/lib/numberFormat'
import { toDisplay, toInternal } from '@/lib/ratingScale'
import { useMe, type RatingCategory } from '@/lib/api/me'
import type { EntryVisibility, RatingDisplayScale } from '@/lib/api/wireEnums'
import { useEditProgress } from '@/lib/api/levelPage'
import { useResolveLevel } from '@/lib/api/logging'
import { computeWeightedAvg } from '@/utils/weightHandling'
import { isSameDayToggleOn } from '@/lib/sameDayToggle'
import { getViewerTimezone } from '@/lib/timezone'
import { zonedDateTimeInput, composeZonedDate } from './editDateTime'
import type { LevelPageData, ProgressUpdate } from '@/lib/api/levelPage'

/**
 * The edit-level form state. Ratings are held in DISPLAY units and converted on save.
 */
export interface EditLevelForm {
  levelNotes: string
  simpleRating: number | null
  ratingScores: Record<string, number | null>
  worstFail: string
  worstFailDate: string
  worstFailTime: string
  worstFailTimezone: string
  worstFailSameDay: boolean
  coinsCollected: number
  userGddlTier: string
  visibility: EntryVisibility
}

// The entry the worst-fail "same day" shortcut anchors to — the completion
// for a beaten level, the most recent drop for a dropped one. Independent of
// any specific progress-update selection (this modal has none), which fixes
// a latent bug in the old combined modal: the shortcut used to depend on
// whichever entry happened to be open, and silently vanished if that was an
// old PROGRESS entry rather than the completion/drop itself.
function findWorstFailAnchor(data: LevelPageData): ProgressUpdate | undefined {
  if (data.status === 'COMPLETED') {
    return data.progressUpdates.find((u) => u.kind === 'COMPLETION')
  }
  if (data.status === 'DROPPED') {
    // progressUpdates is already loggedAt-desc, so the first DROP is the
    // most recent one.
    return data.progressUpdates.find((u) => u.kind === 'DROP')
  }
  return undefined
}

function initForm(
  data: LevelPageData,
  scale: RatingDisplayScale,
  categories: RatingCategory[],
  anchor: ProgressUpdate | undefined
): EditLevelForm {
  const worstFail = zonedDateTimeInput(
    data.worstFailDate,
    data.worstFailDateTimezone
  )
  return {
    levelNotes: data.levelNotes ?? '',
    simpleRating:
      data.simpleRating != null ? toDisplay(data.simpleRating, scale) : null,
    ratingScores: Object.fromEntries(
      categories.map((cat) => {
        const found = data.ratingScores.find((r) => r.categoryId === cat.id)
        return [cat.id, found != null ? toDisplay(found.score, scale) : null]
      })
    ),
    worstFail: data.worstFail != null ? String(data.worstFail) : '',
    worstFailDate: worstFail.date,
    worstFailTime: worstFail.time,
    worstFailTimezone: data.worstFailDateTimezone ?? getViewerTimezone(),
    worstFailSameDay:
      anchor != null &&
      isSameDayToggleOn(
        anchor.date,
        anchor.dateTimezone,
        data.worstFailDate,
        data.worstFailDateTimezone
      ),
    coinsCollected: data.coinsCollected ?? 0,
    userGddlTier: data.userGddlTier != null ? String(data.userGddlTier) : '',
    visibility: data.visibility,
  }
}

/** What {@link useEditLevelForm} hands the fields component. */
export type EditLevelFormState = ReturnType<typeof useEditLevelForm>

/**
 * Form state, validation, and the PATCH payload for the level-scoped fields — everything but the mutation.
 */
export function useEditLevelForm({
  open,
  data,
  levelId,
  scale,
}: {
  open: boolean
  data: LevelPageData
  levelId: string
  scale: RatingDisplayScale
}) {
  const me = useMe()
  const resolveLevel = useResolveLevel()

  const anchor = findWorstFailAnchor(data)
  const [form, setForm] = useState<EditLevelForm>(() =>
    initForm(data, scale, [], anchor)
  )
  const [suggestedGddlTier, setSuggestedGddlTier] = useState<number | null>(
    null
  )

  // Reset from server data when the dialog opens for this level — deliberately
  // NOT keyed on `data` itself (mirrors EditRunModal's reset effect), since a
  // background refetch of the level-page query (e.g. a GDDL sync invalidation
  // for an unrelated level) would otherwise re-fire this and silently wipe
  // whatever the user was mid-typing.
  useEffect(() => {
    if (open && me.data) {
      setForm(initForm(data, scale, me.data.ratingCategories, anchor))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, levelId, scale, me.data])

  // Live "Community: X" hint for the GDDL tier field — a hint, never blocks.
  useEffect(() => {
    if (!open) return
    setSuggestedGddlTier(null)
    if (data.status === 'COMPLETED') {
      resolveLevel.mutate(levelId, {
        onSuccess: (res) => setSuggestedGddlTier(res.suggestedGddlTier),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, levelId])

  const weighted = me.data?.ratingMode === 'WEIGHTED'
  const categories = me.data?.ratingCategories ?? []
  const isCompleted = data.status === 'COMPLETED'
  const hasCoins = (data.level.coins ?? 0) > 0

  const filteredScores = Object.fromEntries(
    Object.entries(form.ratingScores).filter(([, v]) => v != null)
  ) as Record<string, number>
  const weightedAvg = weighted
    ? computeWeightedAvg(categories, filteredScores)
    : null

  const gddlTierError = maxValueError(form.userGddlTier, MAX_GDDL_TIER)

  function patch(updates: Partial<EditLevelForm>) {
    setForm((prev) => ({ ...prev, ...updates }))
  }

  /**
   * The PATCH body for this form, or null when the composed worst-fail date
   * is unusable — in which case the caller must not save.
   */
  function buildPayload(): Record<string, unknown> | null {
    let worstFail: {
      worstFailDate: string | null
      worstFailDateTimezone: string | null
    }
    if (form.worstFailSameDay) {
      // Nudge one second earlier than the anchor instant so the two events
      // don't collide at minute-only display precision.
      worstFail = anchor?.dateTimezone
        ? {
            worstFailDate: new Date(
              new Date(anchor.date as string).getTime() - 1000
            ).toISOString(),
            worstFailDateTimezone: anchor.dateTimezone,
          }
        : { worstFailDate: anchor?.date ?? null, worstFailDateTimezone: null }
    } else {
      const composed = composeZonedDate(
        form.worstFailDate,
        form.worstFailTime,
        form.worstFailTimezone
      )
      if (composed === 'invalid') return null
      worstFail = {
        worstFailDate: composed.date,
        worstFailDateTimezone: composed.dateTimezone,
      }
    }

    const payload: Record<string, unknown> = {
      levelNotes: form.levelNotes || null,
      worstFail: form.worstFail !== '' ? parseInt(form.worstFail, 10) : null,
      ...worstFail,
      visibility: form.visibility,
    }

    if (weighted) {
      payload.ratingScores = Object.entries(form.ratingScores)
        .filter(([, v]) => v != null)
        .map(([categoryId, v]) => ({
          categoryId,
          score: toInternal(v!, scale),
        }))
    } else {
      payload.simpleRating =
        form.simpleRating != null ? toInternal(form.simpleRating, scale) : null
    }

    if (isCompleted) {
      payload.userGddlTier =
        form.userGddlTier !== '' ? parseInt(form.userGddlTier, 10) : null
      if (hasCoins) {
        payload.coinsCollected = form.coinsCollected
      }
    }

    return payload
  }

  return {
    // The modal needs the user's rating config before it can render fields.
    ready: !!me.data,
    form,
    patch,

    // Rating mode
    weighted,
    categories,
    weightedAvg,

    // Conditional sections
    isCompleted,
    hasCoins,
    // Community consensus for the GDDL tier field — a hint, never a block.
    suggestedGddlTier,
    // The entry the "same day" worst-fail shortcut anchors to; absent for a
    // level that is neither completed nor dropped.
    hasWorstFailAnchor: anchor != null,

    gddlTierError,
    levelName: data.level.name ?? `Level #${data.level.inGameId}`,
    // The CoinPicker renders against the level itself, not the form.
    level: data.level,
    buildPayload,
  }
}

/**
 * Form state, validation, and the save mutation for the level-scoped edit modal.
 */
export function useEditLevelModal(args: {
  open: boolean
  onClose: () => void
  data: LevelPageData
  levelId: string
  scale: RatingDisplayScale
}) {
  const { onClose, levelId } = args
  const state = useEditLevelForm(args)
  const editProgress = useEditProgress(levelId)

  function handleSave() {
    const payload = state.buildPayload()
    if (!payload) return

    editProgress.mutate(payload, {
      onSuccess: () => {
        toast.success('Changes saved')
        onClose()
      },
      onError: () => {
        toast.error('Failed to save changes')
      },
    })
  }

  return { ...state, handleSave, isSaving: editProgress.isPending }
}
