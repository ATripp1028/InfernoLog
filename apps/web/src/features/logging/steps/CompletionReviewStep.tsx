import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/sonner'
import { ApiError } from '@/lib/api/client'
import { useLogCompletion } from '@/lib/api/logging'
import { useMe } from '@/lib/api/me'
import { formatDate } from '@/lib/dateFormat'
import { useLoggingFlow } from '../LoggingFlowProvider'
import { LevelHeader, StepBody, StepFooter } from '../components'
import { starCountToDifficulty } from '@/lib/gdAssets'
import { buildCompletionInput, isExtremeContext } from '../payload'
import { formatNumber, formatRating } from '../format'

const OPINION_LABELS: Record<string, string> = {
  NOT_DEMON_WORTHY: 'Not demon-worthy',
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
  INSANE: 'Insane',
  EXTREME: 'Extreme',
}

function opinionLabel(opinion: string, stars: number | null): string {
  const base = OPINION_LABELS[opinion] ?? opinion
  if (opinion === 'NOT_DEMON_WORTHY' && stars != null) {
    return `${base} · ${stars}★ ${starCountToDifficulty(stars)}`
  }
  return base
}

export function CompletionReviewStep() {
  const { level, draft, setStep, setLastCompletion } = useLoggingFlow()
  const me = useMe()
  const logCompletion = useLogCompletion()
  if (!level || !me.data) return null

  const scale = me.data.ratingDisplayScale
  const weighted = me.data.ratingMode === 'WEIGHTED'

  const attempts = draft.attempts.trim()
    ? `${formatNumber(Number(draft.attempts))} attempts`
    : null
  const worstFail = draft.worstFail.trim()
    ? `best run ${draft.worstFail}%`
    : null

  const weightedAvg = weighted
    ? avg(Object.values(draft.ratingScores))
    : draft.simpleRating

  const sessionBits = [
    draft.fps.trim() ? `${draft.fps} FPS` : null,
    draft.onStream ? 'on stream' : null,
    draft.videoUrl.trim() ? 'video attached' : null,
    draft.visibility === 'PRIVATE' ? 'private' : null,
  ].filter(Boolean)

  const gddlBits = [
    draft.gddlTier.trim() ? `Tier ${draft.gddlTier.trim()}` : null,
    draft.submitToGddl ? 'submitting record' : null,
  ].filter(Boolean)

  // NLW / AREDL only apply to extreme demons — mirror the list-references step.
  const showExtremeLists = isExtremeContext(
    level.inGameDifficulty,
    draft.difficultyOpinion
  )

  async function submit() {
    if (!level || !me.data) return
    try {
      const result = await logCompletion.mutateAsync(
        buildCompletionInput(level, draft, me.data)
      )
      setLastCompletion(result.levelProgress.id)
      setStep('c_success')
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not log completion'
      )
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
              value={formatDate(draft.date, me.data.dateFormatPreference)}
            />
          )}
          {level.inGameDifficulty && (
            <Row label="In-game difficulty" value={level.inGameDifficulty} />
          )}
          {draft.difficultyOpinion && (
            <Row
              label="Your difficulty rating"
              value={opinionLabel(
                draft.difficultyOpinion,
                draft.difficultyOpinionStars
              )}
            />
          )}
          {weightedAvg != null && (
            <Row
              label="Rating"
              value={`${formatRating(weightedAvg, scale)}${weighted ? ' (weighted)' : ''}`}
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
          {showExtremeLists && draft.nlwTier.trim() && (
            <Row label="NLW" value={`Tier ${draft.nlwTier.trim()}`} />
          )}
          {showExtremeLists && draft.aredlTier.trim() && (
            <Row label="AREDL" value={`#${draft.aredlTier.trim()}`} />
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

function avg(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}
