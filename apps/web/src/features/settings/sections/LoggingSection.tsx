import { useEffect, useState } from 'react'
import { SettingsSection, SettingRow } from '../components/SettingsSection'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/sonner'
import { DateFormatPreference, useUpdateMe, type MeData } from '@/lib/api/me'

interface LoggingSectionProps {
  me: MeData
}

const DATE_OPTIONS: { value: DateFormatPreference; label: string }[] = [
  { value: 'MDY', label: 'MM/DD/YYYY' },
  { value: 'DMY', label: 'DD/MM/YYYY' },
  { value: 'ISO', label: 'YYYY-MM-DD' },
  { value: 'YMD', label: 'YYYY/MM/DD' },
]

// 60 is the Geometry Dash floor — must stay in sync with MIN_FPS in
// @infernolog/core's UpdateMeSchema.
const MIN_FPS = 60

export function LoggingSection({ me }: LoggingSectionProps) {
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

  // Free-form string while editing; parse/clamp/commit on blur so the user can
  // clear the field and type. Synced back from the server value when idle.
  const [fpsDraft, setFpsDraft] = useState(String(me.defaultFps))
  useEffect(() => {
    setFpsDraft(String(me.defaultFps))
  }, [me.defaultFps])

  const commitFps = async () => {
    const parsed = Math.floor(Number(fpsDraft))
    if (!Number.isFinite(parsed) || parsed < MIN_FPS) {
      setFpsDraft(String(me.defaultFps))
      toast.error(`FPS must be a whole number of at least ${MIN_FPS}`)
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
    <SettingsSection title="Logging">
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
        label="Default FPS"
        description="Pre-filled into the Log Level form. Must be at least 60."
        control={
          <Input
            type="number"
            inputMode="numeric"
            min={MIN_FPS}
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
    </SettingsSection>
  )
}
