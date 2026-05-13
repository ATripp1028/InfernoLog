import { SettingsSection, SettingRow } from '../components/SettingsSection'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/sonner'
import {
  DateFormatPreference,
  useUpdateMe,
  type MeData,
} from '@/lib/api/me'

interface LoggingSectionProps {
  me: MeData
}

const DATE_OPTIONS: { value: DateFormatPreference; label: string }[] = [
  { value: 'MDY', label: 'MM/DD/YYYY' },
  { value: 'DMY', label: 'DD/MM/YYYY' },
  { value: 'ISO', label: 'YYYY-MM-DD' },
  { value: 'YMD', label: 'YYYY/MM/DD' },
]

export function LoggingSection({ me }: LoggingSectionProps) {
  const update = useUpdateMe()

  const handleChange = async (value: string) => {
    try {
      await update.mutateAsync({
        dateFormatPreference: value as DateFormatPreference,
      })
      toast.success('Saved')
    } catch (err) {
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
    </SettingsSection>
  )
}
