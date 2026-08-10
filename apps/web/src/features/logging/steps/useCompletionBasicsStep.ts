// Logic for CompletionBasicsStep: the draft rules the step enforces while
// open — seeding the percentage basis from the user's default, and forcing
// 2.1 for a pre-2.2 date.

import { useEffect } from 'react'
import { useMe } from '@/lib/api/me'
import { useLoggingFlow } from '../LoggingFlowProvider'
import { maxValueError, MAX_ATTEMPTS } from '../format'
import { isPreTwoTwo } from '../gdVersion'

/**
 * Draft rules the completion-basics step enforces while open: seeding the percentage basis, and pinning it to 2.1 for a pre-2.2 date.
 */
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
