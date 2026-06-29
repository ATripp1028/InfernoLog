import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { StepperInput } from '@/components/ui/stepper-input'
import { toast } from '@/components/ui/sonner'
import { difficultyFaceSrc, starCountToDifficulty } from '@/lib/gdAssets'
import { displayMax, toDisplay, toInternal } from '@/features/logging/format'
import {
  useMe,
  type RatingDisplayScale,
  type RatingCategory,
} from '@/lib/api/me'
import { useEditProgress } from '@/lib/api/levelPage'
import { computeWeightedAvg } from '@/utils/weightHandling'
import type { LevelMeta, LevelPageData } from './types'

type DifficultyOpinion =
  | 'EASY'
  | 'MEDIUM'
  | 'HARD'
  | 'INSANE'
  | 'EXTREME'
  | 'NOT_DEMON_WORTHY'

interface EditForm {
  date: string
  dateUncertain: boolean
  attempts: string
  worstFail: string
  fps: string
  onStream: boolean
  difficultyOpinion: DifficultyOpinion | null
  difficultyOpinionStars: number | null
  enjoyment: number | null
  simpleRating: number | null
  videoUrl: string
  highlightUrl: string
  notes: string
  levelNotes: string
  visibility: 'PUBLIC' | 'PRIVATE'
  ratingScores: Record<string, number | null>
  coinsCollected: number
  twoPlayerSolo: boolean | null
  twoPlayerPartner: string
}

function initForm(
  data: LevelPageData,
  scale: RatingDisplayScale,
  categories: RatingCategory[]
): EditForm {
  const latest = data.progressUpdates[0]
  return {
    date: latest?.date ? (latest.date as string).slice(0, 10) : '',
    dateUncertain: latest?.dateUncertain ?? false,
    attempts: latest?.attempts != null ? String(latest.attempts) : '',
    worstFail: data.worstFail != null ? String(data.worstFail) : '',
    fps: latest?.fps != null ? String(latest.fps) : '',
    onStream: latest?.onStream ?? false,
    difficultyOpinion:
      (latest?.difficultyOpinion as DifficultyOpinion | null) ?? null,
    difficultyOpinionStars: latest?.difficultyOpinionStars ?? null,
    enjoyment:
      latest?.enjoyment != null ? toDisplay(latest.enjoyment, scale) : null,
    simpleRating:
      latest?.simpleRating != null
        ? toDisplay(latest.simpleRating, scale)
        : null,
    videoUrl: latest?.videoUrl ?? '',
    highlightUrl: latest?.highlightUrl ?? '',
    notes: latest?.notes ?? '',
    levelNotes: data.levelNotes ?? '',
    visibility: data.visibility,
    ratingScores: Object.fromEntries(
      categories.map((cat) => {
        const found = latest?.ratingScores.find((r) => r.categoryId === cat.id)
        return [cat.id, found != null ? toDisplay(found.score, scale) : null]
      })
    ),
    coinsCollected: latest?.coinsCollected ?? 0,
    twoPlayerSolo: latest?.twoPlayerSolo ?? null,
    twoPlayerPartner: latest?.twoPlayerPartner ?? '',
  }
}

interface EditProgressModalProps {
  open: boolean
  onClose: () => void
  data: LevelPageData
  userId: string
  levelId: string
  scale: RatingDisplayScale
}

export function EditProgressModal({
  open,
  onClose,
  data,
  userId,
  levelId,
  scale,
}: EditProgressModalProps) {
  const [form, setForm] = useState<EditForm>(() => initForm(data, scale, []))
  const editProgress = useEditProgress(userId, levelId)
  const me = useMe()

  useEffect(() => {
    if (open && me.data)
      setForm(initForm(data, scale, me.data.ratingCategories))
  }, [open, data, scale, me.data])

  if (!me.data) return null

  const latestUpdate = data.progressUpdates[0]
  const isCompletion = latestUpdate?.isCompletion ?? false
  const weighted = me.data.ratingMode === 'WEIGHTED'
  const categories = me.data.ratingCategories
  const isTen = scale === 'ZERO_TO_TEN'

  // Weighted avg of currently-set category scores (display units)
  const filteredScores = Object.fromEntries(
    Object.entries(form.ratingScores).filter(([, v]) => v != null)
  ) as Record<string, number>
  const weightedAvg = weighted
    ? computeWeightedAvg(categories, filteredScores)
    : null

  function patch(updates: Partial<EditForm>) {
    setForm((prev) => ({ ...prev, ...updates }))
  }

  function handleSave() {
    const payload: Record<string, unknown> = {
      date: form.date || null,
      dateUncertain: form.dateUncertain,
      attempts: form.attempts !== '' ? parseInt(form.attempts, 10) : null,
      worstFail: form.worstFail !== '' ? parseInt(form.worstFail, 10) : null,
      fps: form.fps !== '' ? parseInt(form.fps, 10) : null,
      onStream: form.onStream,
      notes: form.notes || null,
      levelNotes: form.levelNotes || null,
      visibility: form.visibility,
    }

    if (isCompletion) {
      payload.difficultyOpinion = form.difficultyOpinion
      payload.difficultyOpinionStars = form.difficultyOpinionStars
      payload.enjoyment =
        form.enjoyment != null ? toInternal(form.enjoyment, scale) : null
      if (weighted) {
        payload.ratingScores = Object.entries(form.ratingScores)
          .filter(([, v]) => v != null)
          .map(([categoryId, v]) => ({
            categoryId,
            score: toInternal(v!, scale),
          }))
      } else {
        payload.simpleRating =
          form.simpleRating != null
            ? toInternal(form.simpleRating, scale)
            : null
      }
      payload.videoUrl = form.videoUrl || null
      payload.highlightUrl = form.highlightUrl || null
      if ((data.level.coins ?? 0) > 0) {
        payload.coinsCollected = form.coinsCollected
      }
      if (data.level.twoPlayer) {
        payload.twoPlayerSolo = form.twoPlayerSolo
        payload.twoPlayerPartner =
          form.twoPlayerSolo === false ? form.twoPlayerPartner || null : null
      }
    }

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

  const levelName = data.level.name ?? `Level #${data.level.inGameId}`

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed z-50 focus:outline-none',
            'md:left-1/2 md:top-1/2 md:right-auto md:bottom-auto md:-translate-x-1/2 md:-translate-y-1/2',
            'inset-x-0 bottom-0 w-full md:w-[540px]'
          )}
        >
          <div className="flex max-h-[92vh] flex-col rounded-t-card border border-border bg-bg-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)] md:max-h-[calc(100vh-4rem)] md:rounded-card">
            {/* Mobile drag handle */}
            <div className="flex justify-center pb-1 pt-2 md:hidden">
              <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between px-5 pb-3 pt-4 md:pt-5">
              <div>
                <Dialog.Title className="text-lg font-semibold text-text-primary">
                  Edit entry
                </Dialog.Title>
                <p className="mt-0.5 text-sm text-text-secondary">
                  {levelName}
                </p>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="mt-0.5 flex size-8 items-center justify-center rounded-md bg-bg-elevated text-text-secondary transition-colors hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-2 pt-1">
              {/* ── Details ──────────────────────────────────── */}
              <Section label="Details">
                <div>
                  <FieldLabel htmlFor="ep-date">Date</FieldLabel>
                  <Input
                    id="ep-date"
                    type="date"
                    value={form.date}
                    onChange={(e) => patch({ date: e.target.value })}
                  />
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
                    <Switch
                      checked={form.dateUncertain}
                      onCheckedChange={(v) => patch({ dateUncertain: v })}
                    />
                    Date is uncertain
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel htmlFor="ep-attempts">Attempts</FieldLabel>
                    <Input
                      id="ep-attempts"
                      inputMode="numeric"
                      placeholder="—"
                      value={form.attempts}
                      onChange={(e) =>
                        patch({ attempts: digitsOnly(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="ep-worstfail">Worst fail %</FieldLabel>
                    <Input
                      id="ep-worstfail"
                      inputMode="numeric"
                      placeholder="—"
                      value={form.worstFail}
                      onChange={(e) =>
                        patch({ worstFail: clampPercent(e.target.value) })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel htmlFor="ep-fps">FPS</FieldLabel>
                    <Input
                      id="ep-fps"
                      inputMode="numeric"
                      placeholder="—"
                      value={form.fps}
                      onChange={(e) =>
                        patch({ fps: digitsOnly(e.target.value) })
                      }
                    />
                  </div>
                  <div className="flex items-end pb-2.5">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
                      <Switch
                        checked={form.onStream}
                        onCheckedChange={(v) => patch({ onStream: v })}
                      />
                      On stream
                    </label>
                  </div>
                </div>
              </Section>

              {/* ── Difficulty (completion only) ──────────────── */}
              {isCompletion && (
                <Section label="Difficulty">
                  <DifficultyOpinionSelect
                    value={form.difficultyOpinion}
                    onChange={(v) =>
                      patch({
                        difficultyOpinion: v,
                        ...(v === 'NOT_DEMON_WORTHY'
                          ? {}
                          : { difficultyOpinionStars: null }),
                      })
                    }
                    stars={form.difficultyOpinionStars}
                    onStarsChange={(s) => patch({ difficultyOpinionStars: s })}
                  />
                </Section>
              )}

              {/* ── Coins + 2-Player (completion only, level-conditional) ── */}
              {isCompletion &&
                ((data.level.coins ?? 0) > 0 || data.level.twoPlayer) && (
                  <div
                    className={cn(
                      (data.level.coins ?? 0) > 0 && data.level.twoPlayer
                        ? 'grid grid-cols-2 gap-5 items-start'
                        : ''
                    )}
                  >
                    {(data.level.coins ?? 0) > 0 && (
                      <EditCoinsSection
                        level={data.level}
                        collected={form.coinsCollected}
                        onChange={(v) => patch({ coinsCollected: v })}
                      />
                    )}
                    {data.level.twoPlayer && (
                      <EditTwoPlayerSection
                        solo={form.twoPlayerSolo}
                        partner={form.twoPlayerPartner}
                        onSoloChange={(v) =>
                          patch({ twoPlayerSolo: v, twoPlayerPartner: '' })
                        }
                        onPartnerChange={(v) => patch({ twoPlayerPartner: v })}
                      />
                    )}
                  </div>
                )}

              {/* ── Rating (completion only) ──────────────────── */}
              {isCompletion && (
                <Section label="Rating">
                  {weighted ? (
                    categories.length === 0 ? (
                      <p className="text-sm text-text-tertiary">
                        No rating categories configured. Add some in Settings to
                        rate by category.
                      </p>
                    ) : (
                      <>
                        {categories.map((cat) => (
                          <RatingRow
                            key={cat.id}
                            label={cat.name}
                            sublabel={`weight ${Math.round(cat.weight * 100)}%`}
                            value={form.ratingScores[cat.id] ?? null}
                            scale={scale}
                            onChange={(v) =>
                              patch({
                                ratingScores: {
                                  ...form.ratingScores,
                                  [cat.id]: v,
                                },
                              })
                            }
                          />
                        ))}
                        {weightedAvg != null && (
                          <p className="text-right text-xs text-text-tertiary">
                            Weighted avg:{' '}
                            <span className="font-medium text-text-secondary">
                              {isTen
                                ? weightedAvg.toFixed(1)
                                : Math.round(weightedAvg)}
                            </span>
                          </p>
                        )}
                      </>
                    )
                  ) : (
                    <RatingRow
                      label="Score"
                      value={form.simpleRating}
                      scale={scale}
                      onChange={(v) => patch({ simpleRating: v })}
                    />
                  )}
                  <RatingRow
                    label="Enjoyment"
                    value={form.enjoyment}
                    scale={scale}
                    onChange={(v) => patch({ enjoyment: v })}
                  />
                </Section>
              )}

              {/* ── Media (completion only) ───────────────────── */}
              {isCompletion && (
                <Section label="Media">
                  <div>
                    <FieldLabel htmlFor="ep-video">Video URL</FieldLabel>
                    <Input
                      id="ep-video"
                      type="url"
                      placeholder="https://..."
                      value={form.videoUrl}
                      onChange={(e) => patch({ videoUrl: e.target.value })}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="ep-highlight">
                      Highlight URL
                    </FieldLabel>
                    <Input
                      id="ep-highlight"
                      type="url"
                      placeholder="https://..."
                      value={form.highlightUrl}
                      onChange={(e) => patch({ highlightUrl: e.target.value })}
                    />
                  </div>
                </Section>
              )}

              {/* ── GDDL tier (read-only, managed by GDDL) ───── */}
              {isCompletion &&
                (() => {
                  const gddlRef = latestUpdate?.listReferences.find(
                    (r) => r.listSource === 'GDDL'
                  )
                  if (!gddlRef) return null
                  return (
                    <Section label="List references">
                      <div className="flex items-center justify-between rounded-card border border-border-subtle bg-bg-elevated/40 px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-text-primary">
                            GDDL tier
                          </p>
                          <p className="text-xs text-text-tertiary">
                            Managed via the GDDL platform.
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-text-primary">
                          {gddlRef.tierOrRank}
                        </span>
                      </div>
                    </Section>
                  )
                })()}

              {/* ── Notes ────────────────────────────────────── */}
              <Section label="Notes">
                <div>
                  <FieldLabel htmlFor="ep-notes">Entry notes</FieldLabel>
                  <Textarea
                    id="ep-notes"
                    placeholder="Notes about this session…"
                    value={form.notes}
                    onChange={(e) => patch({ notes: e.target.value })}
                    maxLength={2000}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="ep-levelnotes">
                    About this level
                  </FieldLabel>
                  <Textarea
                    id="ep-levelnotes"
                    placeholder="Your thoughts on this level overall…"
                    value={form.levelNotes}
                    onChange={(e) => patch({ levelNotes: e.target.value })}
                    maxLength={5000}
                  />
                </div>
              </Section>

              {/* ── Privacy ──────────────────────────────────── */}
              <Section label="Privacy">
                <div className="flex items-center justify-between rounded-card border border-border-subtle bg-bg-elevated/40 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      Private entry
                    </p>
                    <p className="text-xs text-text-tertiary">
                      Only you can see this level on your profile.
                    </p>
                  </div>
                  <Switch
                    checked={form.visibility === 'PRIVATE'}
                    onCheckedChange={(v) =>
                      patch({ visibility: v ? 'PRIVATE' : 'PUBLIC' })
                    }
                  />
                </div>
              </Section>

              {/* Bottom padding so last section isn't flush with footer */}
              <div className="h-2" />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={editProgress.isPending}>
                {editProgress.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─── Layout helpers ────────────────────────────────────────────────

function Section({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
      {children}
    </div>
  )
}

function FieldLabel({
  children,
  htmlFor,
}: {
  children: React.ReactNode
  htmlFor?: string
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className="mb-1.5 block text-sm text-text-secondary"
    >
      {children}
    </Label>
  )
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="flex min-h-[80px] w-full rounded-md border border-input bg-bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
    />
  )
}

// ─── Numeric helpers ───────────────────────────────────────────────

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

function clampPercent(value: string): string {
  const digits = digitsOnly(value)
  if (digits === '') return ''
  return String(Math.min(100, Number(digits)))
}

// ─── Difficulty opinion picker ─────────────────────────────────────

const DEMON_OPINIONS = [
  {
    value: 'EASY' as const,
    label: 'Easy Demon',
    face: '/assets/gd/demon-easy.png',
  },
  {
    value: 'MEDIUM' as const,
    label: 'Medium Demon',
    face: '/assets/gd/demon-medium.png',
  },
  {
    value: 'HARD' as const,
    label: 'Hard Demon',
    face: '/assets/gd/demon-hard.png',
  },
  {
    value: 'INSANE' as const,
    label: 'Insane Demon',
    face: '/assets/gd/demon-insane.png',
  },
  {
    value: 'EXTREME' as const,
    label: 'Extreme Demon',
    face: '/assets/gd/demon-extreme.png',
  },
]

function DifficultyOpinionSelect({
  value,
  onChange,
  stars,
  onStarsChange,
}: {
  value: DifficultyOpinion | null
  onChange: (v: DifficultyOpinion) => void
  stars: number | null
  onStarsChange: (s: number) => void
}) {
  const notWorthy = value === 'NOT_DEMON_WORTHY'
  return (
    <div className="space-y-3">
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

// ─── Rating row (slider + stepper) ────────────────────────────────

function RatingRow({
  label,
  sublabel,
  value,
  scale,
  onChange,
}: {
  label: string
  sublabel?: string
  value: number | null
  scale: RatingDisplayScale
  onChange: (display: number) => void
}) {
  const max = displayMax(scale)
  const isTen = scale === 'ZERO_TO_TEN'
  const display = value ?? 0
  return (
    <div className="flex flex-col gap-2 py-1 sm:flex-row sm:items-center sm:gap-4">
      <div className="sm:w-24 sm:shrink-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {sublabel && <p className="text-xs text-text-tertiary">{sublabel}</p>}
      </div>
      <div className="flex flex-col gap-2 sm:contents">
        <Slider
          className="w-full sm:flex-1"
          min={0}
          max={max}
          step={isTen ? 0.1 : 1}
          value={[display]}
          onValueChange={(vals) => onChange(vals[0] ?? 0)}
        />
        <StepperInput
          value={display}
          onChange={onChange}
          min={0}
          max={max}
          precision={isTen ? 1 : 0}
          deltas={isTen ? [0.5, 1] : [5, 10]}
          aria-label={label}
          className="w-full sm:w-auto"
          inputClassName="min-w-0 flex-1 sm:w-12 sm:flex-none"
        />
      </div>
    </div>
  )
}

// ─── Coins ────────────────────────────────────────────────────────

function EditCoinsSection({
  level,
  collected,
  onChange,
}: {
  level: LevelMeta
  collected: number
  onChange: (bitmask: number) => void
}) {
  const count = level.coins ?? 0
  const isOfficial = level.officialSongId != null
  const collectedSrc = isOfficial
    ? '/assets/gd/coin-official.png'
    : '/assets/gd/coin-user.png'

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        Coins
      </p>
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
              className="flex flex-col items-center gap-1"
            >
              <img
                src={
                  isCollected ? collectedSrc : '/assets/gd/coin-uncollected.png'
                }
                alt=""
                className={cn(
                  'size-7 drop-shadow transition-all',
                  !isCollected && 'opacity-40 grayscale',
                  !isOfficial && !level.coinsVerified && isCollected
                    ? '[filter:sepia(0.6)_saturate(2)_hue-rotate(-20deg)]'
                    : ''
                )}
              />
              <span className="text-[10px] text-text-tertiary">
                {isCollected ? 'Got it' : `Coin ${i + 1}`}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── 2-Player ─────────────────────────────────────────────────────

function EditTwoPlayerSection({
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
      <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        2-Player
      </p>
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
          <Label className="mb-1.5 block text-sm text-text-secondary">
            Partner
          </Label>
          <Input
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
