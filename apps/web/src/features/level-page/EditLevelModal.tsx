import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { FieldError } from '@/components/ui/field-error'
import { toast } from '@/components/ui/sonner'
import {
  toDisplay,
  toInternal,
  clampPercent,
  digitsOnly,
  maxValueError,
  formatDisplayRating,
  MAX_GDDL_TIER,
} from '@/features/logging/format'
import {
  useMe,
  type RatingDisplayScale,
  type RatingCategory,
} from '@/lib/api/me'
import { useEditProgress } from '@/lib/api/levelPage'
import { useResolveLevel } from '@/lib/api/logging'
import { computeWeightedAvg } from '@/utils/weightHandling'
import { DateTimeField } from '@/features/logging/components'
import { isSameDayToggleOn } from '@/features/logging/types'
import {
  getViewerTimezone,
  zonedTimeToUtc,
  NonexistentLocalTimeError,
} from '@/lib/timezone'
import {
  Section,
  FieldLabel,
  Textarea,
  RatingRow,
  EditCoinsSection,
  zonedDateTimeInput,
} from './EditShared'
import type { LevelPageData, ProgressUpdate } from './types'

interface EditLevelForm {
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
  visibility: 'PUBLIC' | 'PRIVATE'
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

interface EditLevelModalProps {
  open: boolean
  onClose: () => void
  data: LevelPageData
  levelId: string
  scale: RatingDisplayScale
}

export function EditLevelModal({
  open,
  onClose,
  data,
  levelId,
  scale,
}: EditLevelModalProps) {
  const me = useMe()
  const editProgress = useEditProgress(levelId)
  const resolveLevel = useResolveLevel()

  const anchor = findWorstFailAnchor(data)
  const [form, setForm] = useState<EditLevelForm>(() =>
    initForm(data, scale, [], anchor)
  )
  const [suggestedGddlTier, setSuggestedGddlTier] = useState<number | null>(
    null
  )

  useEffect(() => {
    if (open && me.data) {
      setForm(initForm(data, scale, me.data.ratingCategories, anchor))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data, scale, me.data])

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

  if (!me.data) return null

  const weighted = me.data.ratingMode === 'WEIGHTED'
  const categories = me.data.ratingCategories
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

  function handleSave() {
    let worstFail: {
      worstFailDate: string | null
      worstFailDateTimezone: string | null
    }
    try {
      worstFail = form.worstFailSameDay
        ? // Nudge one second earlier than the anchor instant so the two
          // events don't collide at minute-only display precision.
          anchor?.dateTimezone
          ? {
              worstFailDate: new Date(
                new Date(anchor.date as string).getTime() - 1000
              ).toISOString(),
              worstFailDateTimezone: anchor.dateTimezone,
            }
          : { worstFailDate: anchor?.date ?? null, worstFailDateTimezone: null }
        : form.worstFailDate
          ? form.worstFailTime
            ? {
                worstFailDate: zonedTimeToUtc(
                  form.worstFailDate,
                  form.worstFailTime,
                  form.worstFailTimezone
                ).toISOString(),
                worstFailDateTimezone: form.worstFailTimezone,
              }
            : { worstFailDate: form.worstFailDate, worstFailDateTimezone: null }
          : { worstFailDate: null, worstFailDateTimezone: null }
    } catch (err) {
      if (err instanceof NonexistentLocalTimeError) {
        toast.error(
          "That time doesn't exist in the selected time zone (daylight saving change) — pick a different time."
        )
        return
      }
      throw err
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
            <div className="flex justify-center pb-1 pt-2 md:hidden">
              <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
            </div>

            <div className="flex items-start justify-between px-5 pb-3 pt-4 md:pt-5">
              <div>
                <Dialog.Title className="text-lg font-semibold text-text-primary">
                  Edit level details
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

            <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-2 pt-1">
              <Section label="Worst fail">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel htmlFor="el-worstfail">Worst fail %</FieldLabel>
                    <Input
                      id="el-worstfail"
                      inputMode="numeric"
                      placeholder="—"
                      value={form.worstFail}
                      onChange={(e) =>
                        patch({ worstFail: clampPercent(e.target.value) })
                      }
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <Label
                      htmlFor="el-worstfaildate"
                      className="text-sm text-text-secondary"
                    >
                      Worst fail date
                    </Label>
                    {anchor != null && (
                      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
                        <input
                          type="checkbox"
                          checked={form.worstFailSameDay}
                          onChange={(e) =>
                            patch({ worstFailSameDay: e.target.checked })
                          }
                          className="rounded border-border"
                        />
                        Same day as {isCompleted ? 'completion' : 'drop'}
                      </label>
                    )}
                  </div>
                  {!form.worstFailSameDay && (
                    <DateTimeField
                      dateId="el-worstfaildate"
                      dateValue={form.worstFailDate}
                      timeValue={form.worstFailTime}
                      timezoneValue={form.worstFailTimezone}
                      onDateChange={(v) => patch({ worstFailDate: v })}
                      onTimeChange={(v) => patch({ worstFailTime: v })}
                      onTimezoneChange={(v) => patch({ worstFailTimezone: v })}
                    />
                  )}
                </div>
              </Section>

              {isCompleted && hasCoins && (
                <EditCoinsSection
                  level={data.level}
                  collected={form.coinsCollected}
                  onChange={(v) => patch({ coinsCollected: v })}
                />
              )}

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
                            {formatDisplayRating(weightedAvg)}
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
              </Section>

              {isCompleted && (
                <Section label="GDDL">
                  <div>
                    <FieldLabel htmlFor="el-gddl-tier">
                      Your tier opinion
                    </FieldLabel>
                    <Input
                      id="el-gddl-tier"
                      inputMode="numeric"
                      placeholder={
                        suggestedGddlTier != null
                          ? `Community: ${suggestedGddlTier}`
                          : '—'
                      }
                      value={form.userGddlTier}
                      onChange={(e) =>
                        patch({ userGddlTier: digitsOnly(e.target.value) })
                      }
                    />
                    {gddlTierError && <FieldError>{gddlTierError}</FieldError>}
                  </div>
                </Section>
              )}

              <Section label="Notes">
                <div>
                  <FieldLabel htmlFor="el-levelnotes">
                    About this level
                  </FieldLabel>
                  <Textarea
                    id="el-levelnotes"
                    placeholder="Your thoughts on this level overall…"
                    value={form.levelNotes}
                    onChange={(e) => patch({ levelNotes: e.target.value })}
                    maxLength={5000}
                  />
                </div>
              </Section>

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

              <div className="h-2" />
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={editProgress.isPending || gddlTierError != null}
              >
                {editProgress.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
