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
import type { MeData } from '@/lib/api/me'
import type { DateFormatPreference } from '@/lib/api/wireEnums'
import { useLoggingPreferencesFields } from './useLoggingPreferencesFields'

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
  const {
    dateFormat,
    onDateFormatChange,
    percentageVersion,
    onPercentageVersionChange,
    device,
    onDeviceChange,
    fpsDraft,
    onFpsDraftChange,
    onFpsBlur,
    showHighlightUrl,
    onShowHighlightUrlChange,
  } = useLoggingPreferencesFields(me)

  return (
    <>
      <SettingRow
        label="Date format"
        description="Used when displaying dates throughout the app and as the default format when importing spreadsheets."
        control={
          <Select value={dateFormat} onValueChange={onDateFormatChange}>
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
            value={percentageVersion}
            onValueChange={onPercentageVersionChange}
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
          <Select value={device} onValueChange={onDeviceChange}>
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
            onChange={(e) => onFpsDraftChange(e.target.value)}
            onBlur={onFpsBlur}
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
            checked={showHighlightUrl}
            onCheckedChange={onShowHighlightUrlChange}
          />
        }
      />
    </>
  )
}
