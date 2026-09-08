import { forwardRef, useImperativeHandle, useRef } from 'react'
import {
  SettingStack,
  SettingsSection,
} from '@/components/generic/settings-section'
import {
  RatingConfigEditor,
  type RatingConfigEditorHandle,
} from './RatingConfigEditor'
import type { MeData } from '@/lib/api/me'

/**
 * Imperative handle for saving or resetting the rating configuration from the page chrome.
 */
export interface RatingSectionHandle {
  // Saves the category editor if it's dirty; a no-op returning true when
  // there's nothing to save. False means the editor is in an invalid state
  // (bad weight sum, no categories, empty/duplicate name) — its own validation
  // message is already visible.
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
 * The rating categories a level's weighted average is computed from.
 *
 * There is one rating system and no mode to pick: a level's rating is the
 * weighted average of its per-category scores. A single category at 100% is
 * how an account rates on one number, and that is what a new account starts
 * with.
 *
 * There is no scale to choose either: scores read 0–10 with decimals and
 * enjoyment reads 0–100, fixed. See `lib/ratingScale`.
 */
export const RatingSection = forwardRef<
  RatingSectionHandle,
  RatingSectionProps
>(function RatingSection({ me, hideCategoryActions = false }, ref) {
  const categoryEditorRef = useRef<RatingConfigEditorHandle>(null)

  useImperativeHandle(
    ref,
    () => ({
      save: async () => (await categoryEditorRef.current?.save()) ?? true,
    }),
    []
  )

  return (
    <SettingsSection title="Rating">
      <SettingStack
        label="Categories"
        description="Each category contributes to the weighted average in proportion to its weight, and the active weights must total exactly 100%. Drag to reorder — the item at the top is treated as highest-priority and receives any rounding remainder when you distribute weights equally."
      >
        <RatingConfigEditor
          ref={categoryEditorRef}
          me={me}
          hideActions={hideCategoryActions}
        />
      </SettingStack>
    </SettingsSection>
  )
})
