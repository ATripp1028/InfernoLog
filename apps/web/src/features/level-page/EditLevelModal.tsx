import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  dialogContentAnimation,
  dialogOverlayAnimation,
} from '@/lib/dialogAnimation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { FieldError } from '@/components/ui/field-error'
import { clampPercent, digitsOnly } from '@/features/logging/format'
import { formatDisplayRating } from '@/lib/ratingScale'
import type { RatingDisplayScale } from '@/lib/api/wireEnums'
import { DateTimeField } from '@/features/logging/components'
import {
  Section,
  FieldLabel,
  Textarea,
  RatingRow,
  CoinPicker,
} from './EditShared'
import type { LevelPageData } from './types'
import { useEditLevelModal } from './useEditLevelModal'

interface EditLevelModalProps {
  open: boolean
  onClose: () => void
  data: LevelPageData
  levelId: string
  scale: RatingDisplayScale
}

/**
 * Edits the level-scoped fields — the ones with one value per level rather than per logged event.
 */
export function EditLevelModal({
  open,
  onClose,
  data,
  levelId,
  scale,
}: EditLevelModalProps) {
  const {
    ready,
    form,
    patch,
    weighted,
    categories,
    weightedAvg,
    isCompleted,
    hasCoins,
    suggestedGddlTier,
    hasWorstFailAnchor,
    gddlTierError,
    levelName,
    handleSave,
    isSaving,
  } = useEditLevelModal({ open, onClose, data, levelId, scale })

  if (!ready) return null

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm',
            dialogOverlayAnimation
          )}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed z-50 focus:outline-none',
            dialogContentAnimation,
            'md:left-1/2 md:top-1/2 md:right-auto md:bottom-auto md:-translate-x-1/2 md:-translate-y-1/2',
            'inset-x-0 bottom-0 w-full md:w-[540px]'
          )}
        >
          <div className="flex max-h-[92dvh] flex-col rounded-t-card border border-border bg-bg-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)] md:max-h-[calc(100vh-4rem)] md:rounded-card">
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
                    {hasWorstFailAnchor && (
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
                <Section label="Coins">
                  <CoinPicker
                    level={data.level}
                    collected={form.coinsCollected}
                    onChange={(v) => patch({ coinsCollected: v })}
                  />
                </Section>
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
                disabled={isSaving || gddlTierError != null}
              >
                {isSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
