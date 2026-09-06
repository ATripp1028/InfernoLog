import type { ReactNode } from 'react'
import { Button } from '@/components/generic/button'
import { toast } from '@/components/generic/sonner'
import { useLogCompletion } from '@/lib/api/logging'
import { useMe } from '@/lib/api/me'
import { formatDate, formatTimeOfDay } from '@/lib/dateFormat'
import { useFlowBusy, useLoggingFlow } from '@/context/LoggingFlowContext'
import { LevelHeader, StepBody, StepFooter } from '../components'
import { difficultyLabel } from '@/lib/gdAssets'
import { opinionLabel } from '@/lib/difficultyOpinionLabel'
import { buildCompletionInput, loggingErrorMessage } from '../payload'
import { formatNumber } from '@/lib/numberFormat'
import { formatRating } from '@/lib/ratingScale'
import { computeOverallRating } from '@infernolog/core'
import { overallRatingConfig, ratingScoresFromDraft } from '@/lib/ratingConfig'

/**
 * Completion step 5: everything about to be written, and the submit.
 */
export function CompletionReviewStep() {
  const { level, draft, setStep, setLastCompletion } = useLoggingFlow()
  const me = useMe()
  const logCompletion = useLogCompletion()
  useFlowBusy(logCompletion.isPending)
  if (!level || !me.data) return null

  const scale = me.data.ratingDisplayScale
  const weighted = me.data.ratingMode === 'WEIGHTED'

  const attempts = draft.attempts.trim()
    ? `${formatNumber(Number(draft.attempts))} attempts`
    : null
  const worstFail = draft.worstFail.trim()
    ? `best run ${draft.worstFail}%`
    : null

  // The rating step's readout runs this same pair of helpers on the same
  // draft, so the number here is the one the user already saw.
  const overallRating = computeOverallRating(overallRatingConfig(me.data), {
    simpleRating: draft.simpleRating,
    enjoyment: draft.enjoyment,
    ratingScores: ratingScoresFromDraft(draft.ratingScores),
  })

  const sessionBits = [
    draft.fps.trim() ? `${draft.fps} FPS` : null,
    draft.onStream ? 'on stream' : null,
    draft.videoUrl.trim() ? 'video attached' : null,
    draft.visibility === 'PRIVATE' ? 'private' : null,
  ].filter(Boolean)

  const gddlBits = [
    draft.userGddlTier.trim() ? `Tier ${draft.userGddlTier.trim()}` : null,
  ].filter(Boolean)

  async function submit() {
    if (!level || !me.data) return
    try {
      const result = await logCompletion.mutateAsync(
        buildCompletionInput(level, draft, me.data)
      )
      setLastCompletion(result.levelProgress.id)
      setStep(me.data.hasGddlApiKey ? 'c_gddl' : 'c_success')
    } catch (err) {
      toast.error(loggingErrorMessage(err, 'Could not log completion'))
    }
  }

  return (
    <>
      <StepBody>
        <LevelHeader level={level} />
        <div className="overflow-hidden rounded-md border border-border-subtle">
          <Row
            label="Completion"
            value={['100%', attempts, worstFail].filter(Boolean).join(' · ')}
          />
          {draft.date && (
            <Row
              label="Date"
              value={[
                formatDate(draft.date, me.data.dateFormatPreference),
                draft.time
                  ? formatTimeOfDay(
                      Number(draft.time.slice(0, 2)),
                      Number(draft.time.slice(3, 5)),
                      me.data.dateFormatPreference
                    )
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          )}
          {level.inGameDifficulty && (
            <Row label="In-game difficulty" value={difficultyLabel(level)} />
          )}
          {draft.difficultyOpinion && (
            <Row
              label="Your difficulty rating"
              value={opinionLabel(draft.difficultyOpinion)}
            />
          )}
          {overallRating != null && (
            <Row
              label="Rating"
              value={`${formatRating(overallRating, scale)}${weighted ? ' (weighted)' : ''}`}
            />
          )}
          {draft.enjoyment != null && (
            <Row
              label="Enjoyment"
              value={`${formatRating(draft.enjoyment, scale)}`}
            />
          )}
          {gddlBits.length > 0 && (
            <Row label="GDDL" value={gddlBits.join(' · ')} />
          )}
          {sessionBits.length > 0 && (
            <Row label="Session" value={sessionBits.join(' · ')} />
          )}
        </div>
        <p className="text-xs text-text-tertiary">
          Anything off? Tap Back to fix it — nothing&apos;s saved yet.
        </p>
      </StepBody>

      <StepFooter>
        <Button variant="outline" onClick={() => setStep('c_listrefs')}>
          Back
        </Button>
        <Button onClick={submit} disabled={logCompletion.isPending}>
          {logCompletion.isPending ? 'Logging…' : 'Log completion'}
        </Button>
      </StepFooter>
    </>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-subtle px-4 py-2.5 text-sm last:border-b-0">
      <span className="text-text-secondary">{label}</span>
      <span className="text-right font-medium text-text-primary">{value}</span>
    </div>
  )
}
