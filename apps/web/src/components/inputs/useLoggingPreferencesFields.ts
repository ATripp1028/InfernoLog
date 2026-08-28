// Logic for LoggingPreferencesFields: five independent preference writers,
// each saving to PATCH /v1/me the moment its control changes, plus the FPS
// field's draft-until-blur handling.
//
// The Select controls hand back a bare `string`, so the wire-enum casts live
// here beside the mutation rather than in the JSX — the component renders the
// only items those Selects can produce.

import { useEffect, useState } from 'react'
import { MIN_FPS, MAX_FPS } from '@infernolog/core'
import { toast } from '@/components/generic/sonner'
import { useUpdateMe, type MeData, type UpdateMeInput } from '@/lib/api/me'
import type {
  DateFormatPreference,
  Device,
  GdVersion,
} from '@/lib/api/wireEnums'

/**
 * The current value and change handler of every logging-preference control.
 *
 * There is no Save button — each row writes on change — so a failed write
 * toasts and leaves the other rows alone. Every value reads straight through
 * from the server except {@link LoggingPreferences.fpsDraft}.
 */
export interface LoggingPreferences {
  dateFormat: DateFormatPreference
  onDateFormatChange: (value: string) => void
  percentageVersion: GdVersion
  onPercentageVersionChange: (value: string) => void
  device: Device
  onDeviceChange: (value: string) => void
  /**
   * Free-form while the user types, so the field can be cleared and retyped
   * without a half-finished number being parsed. Committed by
   * {@link LoggingPreferences.onFpsBlur}.
   */
  fpsDraft: string
  onFpsDraftChange: (value: string) => void
  /** Parses, range-checks and saves the draft — or reverts it and says why. */
  onFpsBlur: () => void
  showHighlightUrl: boolean
  onShowHighlightUrlChange: (next: boolean) => void
}

/**
 * The logging-preference controls' values and writers.
 *
 * @param me - The signed-in user. Every value but the FPS draft is read from
 * here rather than mirrored into state, so an optimistic update or a refetch
 * moves the controls without a sync effect.
 */
export function useLoggingPreferencesFields(me: MeData): LoggingPreferences {
  const update = useUpdateMe()

  // The one mirrored value, and so the one that needs syncing back when the
  // server value changes underneath it (another device, a failed write).
  const [fpsDraft, setFpsDraft] = useState(String(me.defaultFps))
  useEffect(() => {
    setFpsDraft(String(me.defaultFps))
  }, [me.defaultFps])

  // Resolves false when the write failed. Only the FPS field acts on that —
  // it is the one control with a draft to roll back.
  const save = async (patch: UpdateMeInput): Promise<boolean> => {
    try {
      await update.mutateAsync(patch)
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
      return false
    }
  }

  const commitFps = async () => {
    const parsed = Math.floor(Number(fpsDraft))
    if (!Number.isFinite(parsed) || parsed < MIN_FPS || parsed > MAX_FPS) {
      setFpsDraft(String(me.defaultFps))
      toast.error(
        `FPS must be a whole number between ${MIN_FPS} and ${MAX_FPS}`
      )
      return
    }
    setFpsDraft(String(parsed))
    if (parsed === me.defaultFps) return
    if (!(await save({ defaultFps: parsed }))) {
      setFpsDraft(String(me.defaultFps))
    }
  }

  return {
    dateFormat: me.dateFormatPreference,
    onDateFormatChange: (value) =>
      void save({ dateFormatPreference: value as DateFormatPreference }),

    percentageVersion: me.defaultPercentageVersion,
    onPercentageVersionChange: (value) =>
      void save({ defaultPercentageVersion: value as GdVersion }),

    device: me.defaultDevice,
    onDeviceChange: (value) => void save({ defaultDevice: value as Device }),

    fpsDraft,
    onFpsDraftChange: setFpsDraft,
    onFpsBlur: () => void commitFps(),

    showHighlightUrl: me.showHighlightUrl,
    onShowHighlightUrlChange: (next) => void save({ showHighlightUrl: next }),
  }
}
