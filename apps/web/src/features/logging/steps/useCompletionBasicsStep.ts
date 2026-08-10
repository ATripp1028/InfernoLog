// Logic for CompletionBasicsStep: the option tables its difficulty and coin
// controls render from, and the draft rules the step enforces while open
// (seeding the percentage basis, and forcing 2.1 for a pre-2.2 date).

import { useEffect } from 'react'
import {
  STAR_TO_OPINION as SHARED_STAR_TO_OPINION,
  NOT_DEMON_OPINION_VALUES,
} from '@infernolog/core'
import type { DifficultyOpinion, Level } from '@/lib/api/logging'
import { useMe } from '@/lib/api/me'
import { useLoggingFlow } from '../LoggingFlowProvider'
import { maxValueError, MAX_ATTEMPTS } from '../format'
import { isPreTwoTwo } from './CompletionSessionStep'

// The five demon-tier opinions, each shown as a round face button. The
// non-demon star values (AUTO..NINE_STAR) are kept behind a labelled
// "Not demon-worthy" text button for clarity.
export const DEMON_OPINIONS: ReadonlyArray<{
  value: DifficultyOpinion
  label: string
  face: string
}> = [
  { value: 'EASY', label: 'Easy Demon', face: '/assets/gd/demon-easy.png' },
  {
    value: 'MEDIUM',
    label: 'Medium Demon',
    face: '/assets/gd/demon-medium.png',
  },
  { value: 'HARD', label: 'Hard Demon', face: '/assets/gd/demon-hard.png' },
  {
    value: 'INSANE',
    label: 'Insane Demon',
    face: '/assets/gd/demon-insane.png',
  },
  {
    value: 'EXTREME',
    label: 'Extreme Demon',
    face: '/assets/gd/demon-extreme.png',
  },
]

// The non-demon star values carry their own star count (1=AUTO..9=NINE_STAR)
// rather than a separate paired field — shared table, see
// packages/core/src/difficultyOpinion.ts.
export const STAR_TO_OPINION = SHARED_STAR_TO_OPINION as Record<
  number,
  DifficultyOpinion
>
export const NOT_DEMON_OPINIONS = new Set<DifficultyOpinion>(
  NOT_DEMON_OPINION_VALUES as DifficultyOpinion[]
)

// Official levels are those with an officialSongId (the built-in GD song set).
export function isOfficialLevel(level: Level): boolean {
  return level.officialSongId != null
}

export function coinSrc(level: Level): string {
  return isOfficialLevel(level)
    ? '/assets/gd/coin-official.png'
    : '/assets/gd/coin-user.png'
}

export function coinUncollectedSrc(): string {
  return '/assets/gd/coin-uncollected.png'
}

export function useCompletionBasicsStep() {
  const { level, draft, patchDraft, setStep } = useLoggingFlow()
  const me = useMe()

  const defaultPercentageVersion =
    me.data?.defaultPercentageVersion ?? 'TWO_TWO'
  useEffect(() => {
    if (draft.percentageVersion === null) {
      patchDraft({ percentageVersion: defaultPercentageVersion })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPercentageVersion])

  useEffect(() => {
    if (draft.date && isPreTwoTwo(draft.date)) {
      patchDraft({ percentageVersion: 'TWO_ONE' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.date])

  return {
    level,
    draft,
    patchDraft,
    setStep,
    // A 2.1-era date pins the percentage basis, so there is nothing to pick.
    showVersionPicker:
      level?.levelType === 'CLASSIC' && !isPreTwoTwo(draft.date),
    attemptsError: maxValueError(draft.attempts, MAX_ATTEMPTS),
  }
}
