// Draft state for one row's inline rating edit.
//
// Values are held in DISPLAY units (0–10 or 0–100) because that is what the
// user types and what the inputs speak; the conversion to the internal 0–100
// integer happens once, at save.

import { useState } from 'react'
import { computeOverallRating, type OverallRatingConfig } from '@infernolog/core'
import { toDisplay, toInternal } from '@/lib/ratingScale'
import type { RatingCategory } from '@/lib/api/me'
import type { RatingDisplayScale } from '@/lib/api/wireEnums'
import type { RatingEdit } from '@/lib/api/ranking'

interface UseRowEditorArgs {
  levelId: string
  scale: RatingDisplayScale
  config: OverallRatingConfig
  categories: RatingCategory[]
  /** The level's current overall rating, internal 0–100. */
  overallRating: number | null
  /** The level's current per-category scores, internal 0–100. */
  ratingScores: readonly { categoryId: string; score: number }[]
}

/**
 * The draft, the live preview, and the payload one row's editor produces.
 *
 * The preview runs through the same `computeOverallRating` the server uses, so
 * the number shown while a stepper changes is the number the row will settle
 * on — not an approximation that shifts once the save returns.
 */
export function useRowEditor({
  levelId,
  scale,
  config,
  categories,
  overallRating,
  ratingScores,
}: UseRowEditorArgs) {
  const isWeighted = config.ratingMode === 'WEIGHTED'

  // SIMPLE: the one score. In SIMPLE mode the overall rating IS the simple
  // rating, so it seeds the field directly.
  const [simple, setSimple] = useState<number>(() =>
    overallRating == null ? 0 : toDisplay(overallRating, scale)
  )

  // WEIGHTED: one score per category, seeded from what the level already has.
  const [scores, setScores] = useState<Record<string, number>>(() => {
    const seeded: Record<string, number> = {}
    for (const category of categories) {
      const existing = ratingScores.find((s) => s.categoryId === category.id)
      seeded[category.id] = existing ? toDisplay(existing.score, scale) : 0
    }
    return seeded
  })

  const setScore = (categoryId: string, value: number) =>
    setScores((prev) => ({ ...prev, [categoryId]: value }))

  // The internal-unit form of the draft, which is both what the preview reads
  // and what the save sends — so the two cannot disagree.
  const draftScores = categories.map((category) => ({
    categoryId: category.id,
    score: toInternal(scores[category.id] ?? 0, scale),
  }))
  const draftSimple = toInternal(simple, scale)

  const preview = computeOverallRating(config, {
    simpleRating: draftSimple,
    // Enjoyment is not editable here, and only counts when the user opted in.
    enjoyment: null,
    ratingScores: draftScores,
  })

  const edit: RatingEdit = isWeighted
    ? { levelId, ratingScores: draftScores }
    : { levelId, simpleRating: draftSimple }

  return { isWeighted, simple, setSimple, scores, setScore, preview, edit }
}
