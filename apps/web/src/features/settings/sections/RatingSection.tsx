import {
  SettingRow,
  SettingStack,
  SettingsSection,
} from '../components/SettingsSection'
import { RatingCategoriesList } from '../components/RatingCategoriesList'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import { RatingMode, useUpdateMe, type MeData } from '@/lib/api/me'

interface RatingSectionProps {
  me: MeData
}

export function RatingSection({ me }: RatingSectionProps) {
  const update = useUpdateMe()

  const handleModeChange = async (mode: RatingMode) => {
    if (mode === me.ratingMode) return
    try {
      await update.mutateAsync({ ratingMode: mode })
      toast.success('Saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const handleEnjoymentToggle = async (next: boolean) => {
    try {
      await update.mutateAsync({ includeEnjoyment: next })
      toast.success('Saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const modeDescription =
    me.ratingMode === 'SIMPLE'
      ? 'A single 0–10 score per completion.'
      : 'Per-category scores combined into a weighted average.'

  return (
    <SettingsSection title="Rating">
      <SettingStack label="Rating mode" description={modeDescription}>
        <div className="inline-flex rounded-md border border-[var(--color-border)] bg-card p-1">
          <ModeButton
            active={me.ratingMode === 'SIMPLE'}
            onClick={() => void handleModeChange('SIMPLE')}
          >
            Simple
          </ModeButton>
          <ModeButton
            active={me.ratingMode === 'WEIGHTED'}
            onClick={() => void handleModeChange('WEIGHTED')}
          >
            Weighted
          </ModeButton>
        </div>
      </SettingStack>

      {me.ratingMode === 'WEIGHTED' && (
        <>
          <SettingStack
            label="Categories"
            description="Each category contributes to the weighted average proportional to its weight."
          >
            <RatingCategoriesList categories={me.ratingCategories} />
          </SettingStack>

          <SettingRow
            label="Include enjoyment in weighted average"
            description="When enabled, your enjoyment score is treated as one of the categories."
            control={
              <Switch
                checked={me.includeEnjoyment}
                onCheckedChange={(v) => void handleEnjoymentToggle(v)}
              />
            }
          />
        </>
      )}
    </SettingsSection>
  )
}

interface ModeButtonProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function ModeButton({ active, onClick, children }: ModeButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        'rounded-sm px-4',
        active && 'bg-primary text-primary-foreground hover:bg-[var(--color-primary-hover)] hover:text-primary-foreground'
      )}
    >
      {children}
    </Button>
  )
}
