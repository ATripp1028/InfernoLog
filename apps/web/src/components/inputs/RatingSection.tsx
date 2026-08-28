import { forwardRef, useImperativeHandle, useRef } from 'react'
import {
  SettingStack,
  SettingsSection,
} from '@/components/generic/settings-section'
import {
  RatingConfigEditor,
  type RatingConfigEditorHandle,
} from './RatingConfigEditor'
import { Button } from '@/components/generic/button'
import { toast } from '@/components/generic/sonner'
import { cn } from '@/lib/utils'
import { useUpdateMe, type MeData } from '@/lib/api/me'
import type { RatingDisplayScale, RatingMode } from '@/lib/api/wireEnums'

/**
 * Imperative handle for saving or resetting the rating configuration from the page chrome.
 */
export interface RatingSectionHandle {
  // Saves the category editor if it's mounted (weighted mode) and dirty; a
  // no-op returning true in simple mode or when there's nothing to save.
  // False means the category editor is in an invalid state (bad weight sum,
  // empty/duplicate name) — its own validation message is already visible.
  save: () => Promise<boolean>
}

interface RatingSectionProps {
  me: MeData
  // Onboarding submits this whole section via its own Continue button
  // instead of the category editor's separate Save/Reset — see
  // RatingSectionHandle.
  hideCategoryActions?: boolean
}

/**
 * Rating mode, display scale, and — in weighted mode — the category editor.
 */
export const RatingSection = forwardRef<
  RatingSectionHandle,
  RatingSectionProps
>(function RatingSection({ me, hideCategoryActions = false }, ref) {
  const update = useUpdateMe()
  const categoryEditorRef = useRef<RatingConfigEditorHandle>(null)

  useImperativeHandle(
    ref,
    () => ({
      save: async () => {
        if (me.ratingMode !== 'WEIGHTED') return true
        return (await categoryEditorRef.current?.save()) ?? true
      },
    }),
    [me.ratingMode]
  )

  const handleModeChange = async (mode: RatingMode) => {
    if (mode === me.ratingMode) return
    try {
      await update.mutateAsync({ ratingMode: mode })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const handleScaleChange = async (scale: RatingDisplayScale) => {
    if (scale === me.ratingDisplayScale) return
    try {
      await update.mutateAsync({ ratingDisplayScale: scale })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const modeDescription =
    me.ratingMode === 'SIMPLE'
      ? 'A single score per completion.'
      : 'Per-category scores combined into a weighted average.'

  const scaleDescription =
    me.ratingDisplayScale === 'ZERO_TO_TEN'
      ? 'Ratings are displayed and entered as 0–10 (e.g. 4.7). Stored internally as 0–100.'
      : 'Ratings are displayed and entered as 0–100 (e.g. 47).'

  return (
    <SettingsSection title="Rating">
      <SettingStack label="Rating mode" description={modeDescription}>
        <SettingToggleGroup
          options={[
            { value: 'SIMPLE', label: 'Simple' },
            { value: 'WEIGHTED', label: 'Weighted' },
          ]}
          value={me.ratingMode}
          onChange={(v) => void handleModeChange(v as RatingMode)}
        />
      </SettingStack>

      <SettingStack label="Display scale" description={scaleDescription}>
        <SettingToggleGroup
          options={[
            { value: 'ZERO_TO_TEN', label: '0–10' },
            { value: 'ZERO_TO_HUNDRED', label: '0–100' },
          ]}
          value={me.ratingDisplayScale}
          onChange={(v) => void handleScaleChange(v as RatingDisplayScale)}
        />
      </SettingStack>

      {me.ratingMode === 'WEIGHTED' && (
        <SettingStack
          label="Categories"
          description="Each category contributes to the weighted average proportional to its weight. Active weights must sum to exactly 1.00. Drag to reorder — the item at the top is treated as highest-priority and receives any rounding remainder when you distribute weights equally."
        >
          <RatingConfigEditor
            ref={categoryEditorRef}
            me={me}
            hideActions={hideCategoryActions}
          />
        </SettingStack>
      )}
    </SettingsSection>
  )
})

interface SettingToggleGroupProps<T extends string> {
  options: { value: T; label: string }[]
  value: T
  onChange: (next: T) => void
}

// Deliberately NOT components/ui/segmented's Segmented, despite answering the
// same question. That one is a row of full-width outlined pills sized for a
// form field; this is a compact inline toggle sized to sit at the end of a
// settings row. Same shape, different surface — the name is what was
// confusing, not the existence of both.
function SettingToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: SettingToggleGroupProps<T>) {
  return (
    <div className="inline-flex rounded-md border border-border bg-card p-1">
      {options.map((o) => (
        <Button
          key={o.value}
          variant="ghost"
          size="sm"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-sm px-4',
            o.value === value &&
              'bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground'
          )}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}
