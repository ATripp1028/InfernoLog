// Logic for CompletionBasicsStep: the option tables its difficulty and coin
// controls render from, and the draft rules the step enforces while open
// (seeding the percentage basis, and forcing 2.1 for a pre-2.2 date).

import { useEffect } from 'react'
import type { Level } from '@/lib/api/logging'
import { useMe } from '@/lib/api/me'
import { useLoggingFlow } from '../LoggingFlowProvider'
import { maxValueError, MAX_ATTEMPTS } from '../format'
import { isPreTwoTwo } from './CompletionSessionStep'

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
