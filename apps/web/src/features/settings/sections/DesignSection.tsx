import { SettingsSection, SettingRow } from '../components/SettingsSection'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/sonner'
import { useUpdateMe, type MeData } from '@/lib/api/me'

interface DesignSectionProps {
  me: MeData
}

/**
 * Display preferences: rating scale, date format, FAB labels.
 */
export function DesignSection({ me }: DesignSectionProps) {
  const update = useUpdateMe()

  const handleToggle = async (next: boolean) => {
    try {
      await update.mutateAsync({ autoExpandFabLabels: next })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  return (
    <SettingsSection title="Design">
      <p className="text-sm text-muted-foreground">
        Theme options are coming in a future release. InfernoLog is dark mode
        only for now.
      </p>
      <SettingRow
        label="Auto-expand quick action labels"
        description="When you hover a floating action button, immediately show every option's name instead of only the one under your pointer. Turn this off once you've learned the icons."
        control={
          <Switch
            checked={me.autoExpandFabLabels}
            onCheckedChange={(v) => void handleToggle(v)}
          />
        }
      />
    </SettingsSection>
  )
}
