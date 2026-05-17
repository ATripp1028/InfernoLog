import { SettingsSection } from '../components/SettingsSection'

export function DesignSection() {
  return (
    <SettingsSection title="Design" showSeparator={false}>
      <p className="text-sm text-muted-foreground">
        Theme options are coming in a future release. InfernoLog is dark mode
        only for now.
      </p>
    </SettingsSection>
  )
}
