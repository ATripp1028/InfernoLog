import { SettingsSection, SettingRow } from '../components/SettingsSection'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/sonner'
import { useUpdateMe, type MeData } from '@/lib/api/me'

interface PrivacySectionProps {
  me: MeData
}

export function PrivacySection({ me }: PrivacySectionProps) {
  const update = useUpdateMe()

  const handleToggle = async (
    field: 'profilePublic' | 'discordPublic',
    next: boolean
  ) => {
    try {
      await update.mutateAsync({ [field]: next })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  return (
    <SettingsSection title="Privacy">
      <SettingRow
        label={me.profilePublic ? 'Profile is public' : 'Profile is private'}
        description="Private profiles are hidden from everyone except you. Returns 403 to any API request."
        control={
          <Switch
            checked={me.profilePublic}
            onCheckedChange={(v) => void handleToggle('profilePublic', v)}
          />
        }
      />
      {me.discordId && (
        <SettingRow
          label={
            me.discordPublic
              ? 'Discord shown on profile'
              : 'Discord hidden from profile'
          }
          description="Controls whether your Discord account is shown on your public profile."
          control={
            <Switch
              checked={me.discordPublic}
              onCheckedChange={(v) => void handleToggle('discordPublic', v)}
            />
          }
        />
      )}
    </SettingsSection>
  )
}
