import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { difficultyFaceSrc, starCountToDifficulty } from '@/lib/gdAssets'
import type { DifficultyOpinion, Level } from '@/lib/api/logging'
import { useLoggingFlow } from '../LoggingFlowProvider'
import {
  FieldHint,
  FieldLabel,
  LevelHeader,
  StepBody,
  StepFooter,
} from '../components'
import { clampPercent, digitsOnly } from '../format'

// The five demon-tier opinions, each shown as a round face button. The sixth
// opinion (NOT_DEMON_WORTHY) is kept as a labelled text button for clarity.
const DEMON_OPINIONS: ReadonlyArray<{
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

export function CompletionBasicsStep() {
  const { level, draft, patchDraft, setStep } = useLoggingFlow()
  if (!level) return null

  return (
    <>
      <StepBody>
        <LevelHeader level={level} />

        {!level.isDemon && (
          <Card variant="accent" className="flex gap-3 p-4">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-semibold text-text-primary">
                This isn&apos;t a demon
              </p>
              <p className="text-sm text-text-secondary">
                InfernoLog is built for demon tracking. You can still log it —
                it just won&apos;t appear in your difficulty ranking by default.
              </p>
            </div>
          </Card>
        )}

        <div>
          <FieldLabel htmlFor="c-date">Date</FieldLabel>
          <Input
            id="c-date"
            type="date"
            value={draft.date ?? ''}
            onChange={(e) => patchDraft({ date: e.target.value || null })}
          />
          <label className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
            <Switch
              checked={draft.dateUncertain}
              onCheckedChange={(v) => patchDraft({ dateUncertain: v })}
            />
            Date is uncertain
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="c-attempts">Attempts</FieldLabel>
            <Input
              id="c-attempts"
              inputMode="numeric"
              value={draft.attempts}
              onChange={(e) =>
                patchDraft({ attempts: digitsOnly(e.target.value) })
              }
            />
            <FieldHint>Cumulative across all copies and reuploads.</FieldHint>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <FieldLabel
                htmlFor="c-worstfail"
                hint="Your best run from 0% before beating it."
              >
                Worst fail
              </FieldLabel>
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={draft.worstFailAlreadyLogged}
                  onChange={(e) =>
                    patchDraft({ worstFailAlreadyLogged: e.target.checked })
                  }
                  className="rounded border-border"
                />
                Already logged
              </label>
            </div>
            <Input
              id="c-worstfail"
              inputMode="numeric"
              disabled={draft.worstFailAlreadyLogged}
              value={draft.worstFail}
              onChange={(e) =>
                patchDraft({ worstFail: clampPercent(e.target.value) })
              }
            />
            <Input
              id="c-worstfaildate"
              type="date"
              disabled={draft.worstFailAlreadyLogged}
              value={draft.worstFailDate}
              onChange={(e) =>
                patchDraft({ worstFailDate: e.target.value })
              }
            />
            {draft.worstFailAlreadyLogged ? (
              <FieldHint>Keeping your previously logged worst fail.</FieldHint>
            ) : (
              <FieldHint>% and date of your best run from 0%.</FieldHint>
            )}
          </div>
        </div>

        <div>
          <FieldLabel hint="What you think it deserves — separate from the in-game rating.">
            Your difficulty opinion
          </FieldLabel>
          <DifficultyOpinionSelect
            value={draft.difficultyOpinion}
            onChange={(v) =>
              patchDraft({
                difficultyOpinion: v,
                // Clear the star sub-choice when leaving "Not demon-worthy".
                ...(v === 'NOT_DEMON_WORTHY'
                  ? {}
                  : { difficultyOpinionStars: null }),
              })
            }
            stars={draft.difficultyOpinionStars}
            onStarsChange={(s) => patchDraft({ difficultyOpinionStars: s })}
          />
          <FieldHint>
            What you think it deserves — separate from the in-game rating shown
            above. Pick &quot;Not demon-worthy&quot; if you don&apos;t think it
            earns a demon face, then say what difficulty you&apos;d give it.
          </FieldHint>
        </div>

        {((level.coins ?? 0) > 0 || level.twoPlayer) && (
          <div
            className={cn(
              (level.coins ?? 0) > 0 && level.twoPlayer
                ? 'grid grid-cols-2 gap-5 items-start'
                : ''
            )}
          >
            {(level.coins ?? 0) > 0 && (
              <CoinsSection
                level={level}
                collected={draft.coinsCollected}
                onChange={(v) => patchDraft({ coinsCollected: v })}
              />
            )}
            {level.twoPlayer && (
              <TwoPlayerSection
                solo={draft.twoPlayerSolo}
                partner={draft.twoPlayerPartner}
                onSoloChange={(v) =>
                  patchDraft({ twoPlayerSolo: v, twoPlayerPartner: '' })
                }
                onPartnerChange={(v) => patchDraft({ twoPlayerPartner: v })}
              />
            )}
          </div>
        )}
      </StepBody>

      <StepFooter>
        <Button variant="outline" onClick={() => setStep('find')}>
          Back
        </Button>
        <Button onClick={() => setStep('c_rating')}>Continue</Button>
      </StepFooter>
    </>
  )
}

function DifficultyOpinionSelect({
  value,
  onChange,
  stars,
  onStarsChange,
}: {
  value: DifficultyOpinion | null
  onChange: (value: DifficultyOpinion) => void
  stars: number | null
  onStarsChange: (stars: number) => void
}) {
  const notWorthy = value === 'NOT_DEMON_WORTHY'
  return (
    <div className="space-y-3">
      {/* Demon difficulty faces — one row, evenly spaced across the width. */}
      <div className="grid grid-cols-5 justify-items-center gap-2">
        {DEMON_OPINIONS.map((opt) => {
          const active = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              aria-label={opt.label}
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className={cn(
                'flex size-12 items-center justify-center rounded-full border transition-all',
                active
                  ? 'border-primary bg-primary/20 ring-2 ring-primary'
                  : 'border-border bg-bg-elevated/50 hover:bg-bg-elevated/80'
              )}
            >
              <img src={opt.face} alt="" className="size-8" />
            </button>
          )
        })}
      </div>

      {/* "Not demon-worthy" on its own row so it never wraps the face row. */}
      <button
        type="button"
        aria-pressed={notWorthy}
        onClick={() => onChange('NOT_DEMON_WORTHY')}
        className={cn(
          'h-10 w-full rounded-md border px-4 text-sm font-medium transition-colors',
          notWorthy
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-bg-surface/60 text-text-secondary hover:text-text-primary'
        )}
      >
        Not demon-worthy
      </button>

      {/* Non-demon difficulty, by star count, shown when it's not demon-worthy.
          Most non-demons logged here are still demons to someone, so this is
          kept secondary. */}
      {notWorthy && (
        <div>
          <p className="mb-1.5 text-xs text-text-tertiary">
            What difficulty would you give it?
          </p>
          <div className="grid grid-cols-5 justify-items-center gap-2 sm:grid-cols-9">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
              const active = stars === n
              const difficulty = starCountToDifficulty(n)
              return (
                <button
                  key={n}
                  type="button"
                  title={`${n}★ · ${difficulty}`}
                  aria-label={`${n} star ${difficulty}`}
                  aria-pressed={active}
                  onClick={() => onStarsChange(n)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-md border px-2 py-1 transition-all',
                    active
                      ? 'border-primary bg-primary/15 ring-1 ring-primary'
                      : 'border-border bg-bg-surface/60 hover:bg-bg-elevated/60'
                  )}
                >
                  <img
                    src={difficultyFaceSrc(difficulty)}
                    alt=""
                    className="size-6"
                  />
                  <span className="text-[10px] font-medium text-text-secondary">
                    {n}★
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Official levels are those with an officialSongId (the built-in GD song set).
function isOfficialLevel(level: Level): boolean {
  return level.officialSongId != null
}

function coinSrc(level: Level): string {
  return isOfficialLevel(level)
    ? '/assets/gd/coin-official.png'
    : '/assets/gd/coin-user.png'
}

function coinUncollectedSrc(): string {
  return '/assets/gd/coin-uncollected.png'
}

function CoinsSection({
  level,
  collected,
  onChange,
}: {
  level: Level
  collected: number
  onChange: (bitmask: number) => void
}) {
  const count = level.coins ?? 0
  const isOfficial = isOfficialLevel(level)
  const collectedSrc = coinSrc(level)

  return (
    <div className="space-y-3">
      <FieldLabel htmlFor="c-attempts">Coins</FieldLabel>
      <div className="flex gap-3">
        {Array.from({ length: count }, (_, i) => {
          const bit = 1 << i
          const isCollected = (collected & bit) !== 0
          return (
            <button
              key={i}
              type="button"
              aria-label={`Coin ${i + 1} ${isCollected ? '(collected)' : '(not collected)'}`}
              aria-pressed={isCollected}
              onClick={() => onChange(collected ^ bit)}
              className="group flex flex-col items-center gap-1"
            >
              <div
                className={cn(
                  'flex size-10 items-center justify-center rounded-full border transition-all',
                  isCollected
                    ? 'border-transparent bg-transparent'
                    : 'border-border bg-bg-elevated/50 opacity-40 grayscale'
                )}
              >
                <img
                  src={isCollected ? collectedSrc : coinUncollectedSrc()}
                  alt=""
                  className={cn(
                    'size-7 drop-shadow transition-all',
                    !isCollected && 'opacity-60',
                    // Unverified user coins: tint silver→bronze via CSS filter
                    !isOfficial && !level.coinsVerified && isCollected
                      ? '[filter:sepia(0.6)_saturate(2)_hue-rotate(-20deg)]'
                      : ''
                  )}
                />
              </div>
              <span className="text-[10px] text-text-tertiary">
                {isCollected ? 'Got it' : `Coin ${i + 1}`}
              </span>
            </button>
          )
        })}
      </div>
      <FieldHint>Click a coin to mark it as collected.</FieldHint>
    </div>
  )
}

function TwoPlayerSection({
  solo,
  partner,
  onSoloChange,
  onPartnerChange,
}: {
  solo: boolean | null
  partner: string
  onSoloChange: (v: boolean) => void
  onPartnerChange: (v: string) => void
}) {
  return (
    <div className="space-y-3">
      <FieldLabel htmlFor="c-attempts">2-Player</FieldLabel>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          aria-pressed={solo === true}
          onClick={() => onSoloChange(true)}
          className={cn(
            'rounded-md border px-4 py-2.5 text-sm font-medium transition-colors',
            solo === true
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-bg-surface/60 text-text-secondary hover:text-text-primary'
          )}
        >
          Beat it solo
        </button>
        <button
          type="button"
          aria-pressed={solo === false}
          onClick={() => onSoloChange(false)}
          className={cn(
            'rounded-md border px-4 py-2.5 text-sm font-medium transition-colors',
            solo === false
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-bg-surface/60 text-text-secondary hover:text-text-primary'
          )}
        >
          With a partner
        </button>
      </div>
      {solo === false && (
        <div>
          <FieldLabel htmlFor="c-partner">Partner</FieldLabel>
          <Input
            id="c-partner"
            value={partner}
            onChange={(e) => onPartnerChange(e.target.value)}
            placeholder="Partner's name (optional)"
            maxLength={100}
          />
        </div>
      )}
    </div>
  )
}
