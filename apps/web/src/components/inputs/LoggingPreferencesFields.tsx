import { useEffect, useState } from 'react'
import { MIN_FPS, MAX_FPS } from '@infernolog/core'
import { SettingRow } from '@/components/generic/settings-section'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/generic/select'
import { Input } from '@/components/generic/input'
import { Switch } from '@/components/generic/switch'
import { toast } from '@/components/generic/sonner'
import { useUpdateMe, type MeData } from '@/lib/api/me'
import type {
  DateFormatPreference,
  Device,
  GdVersion,
} from '@/lib/api/wireEnums'

const DATE_OPTIONS: { value: DateFormatPreference; label: string }[] = [
  { value: 'MDY', label: 'MM/DD/YYYY' },
  { value: 'DMY', label: 'DD/MM/YYYY' },
  { value: 'ISO', label: 'YYYY-MM-DD' },
  { value: 'YMD', label: 'YYYY/MM/DD' },
]

/**
 * The logging-preference rows — date format, % version, device, FPS, and the
 * highlight-URL toggle.
 *
 * Shared rather than owned by Settings so the onboarding wizard's Logging step
 * gets exactly the same rows, without the Settings-only Import/Export ones
 * that don't belong there (Import is its own onboarding step; Export doesn't
 * apply pre-onboarding).
 */
export function LoggingPreferencesFields({ me }: { me: MeData }) {
  const update = useUpdateMe()

  const handleToggle = async (field: 'showHighlightUrl', next: boolean) => {
    try {
      await update.mutateAsync({ [field]: next })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const handleChange = async (value: string) => {
    try {
      await update.mutateAsync({
        dateFormatPreference: value as DateFormatPreference,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const handlePercentageVersionChange = async (value: GdVersion) => {
    try {
      await update.mutateAsync({ defaultPercentageVersion: value })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const handleDeviceChange = async (value: Device) => {
    try {
      await update.mutateAsync({ defaultDevice: value })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  // Free-form string while editing; parse/clamp/commit on blur so the user can
  // clear the field and type. Synced back from the server value when idle.
  const [fpsDraft, setFpsDraft] = useState(String(me.defaultFps))
  useEffect(() => {
    setFpsDraft(String(me.defaultFps))
  }, [me.defaultFps])

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
    try {
      await update.mutateAsync({ defaultFps: parsed })
    } catch (err) {
      setFpsDraft(String(me.defaultFps))
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  return (
    <>
      <SettingRow
        label="Date format"
        description="Used when displaying dates throughout the app and as the default format when importing spreadsheets."
        control={
          <Select
            value={me.dateFormatPreference}
            onValueChange={(v) => void handleChange(v)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <SettingRow
        label="Default % version"
        description="Which GD version's percentage system to pre-select when logging. 2.1 uses distance to the endwall; 2.2 uses time relative to the verification attempt."
        control={
          <Select
            value={me.defaultPercentageVersion}
            onValueChange={(v) =>
              void handlePercentageVersionChange(v as GdVersion)
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TWO_TWO">2.2 (time-based)</SelectItem>
              <SelectItem value="TWO_ONE">2.1 (distance-based)</SelectItem>
            </SelectContent>
          </Select>
        }
      />
      <SettingRow
        label="Default device"
        description="Which device to pre-select when logging."
        control={
          <Select
            value={me.defaultDevice}
            onValueChange={(v) => void handleDeviceChange(v as Device)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pc">PC</SelectItem>
              <SelectItem value="mobile">Mobile</SelectItem>
            </SelectContent>
          </Select>
        }
      />
      <SettingRow
        label="Default FPS"
        description="Pre-filled into the Log Level form. Must be at least 60."
        control={
          <Input
            type="number"
            inputMode="numeric"
            min={MIN_FPS}
            max={MAX_FPS}
            step={1}
            className="w-44"
            aria-label="Default FPS"
            value={fpsDraft}
            onChange={(e) => setFpsDraft(e.target.value)}
            onBlur={() => void commitFps()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        }
      />
      <SettingRow
        label="Show Highlight URL field"
        description="Adds a Highlight URL field to the logging and edit workflows. Useful for content creators who maintain highlight reels."
        control={
          <Switch
            checked={me.showHighlightUrl}
            onCheckedChange={(v) => void handleToggle('showHighlightUrl', v)}
          />
        }
      />
    </>
  )
}
