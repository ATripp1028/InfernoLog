import { SettingStack, SettingsSection } from '../components/SettingsSection'
import { RatingConfigEditor } from '../components/RatingConfigEditor'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import {
  RatingDisplayScale,
  RatingMode,
  useUpdateMe,
  type MeData,
} from '@/lib/api/me'

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

  const handleScaleChange = async (scale: RatingDisplayScale) => {
    if (scale === me.ratingDisplayScale) return
    try {
      await update.mutateAsync({ ratingDisplayScale: scale })
      toast.success('Saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const modeDescription =
    me.ratingMode === 'SIMPLE'
      ? 'A single score per completion.'
      : 'Per-category scores combined into a weighted average.'

  const scaleDescription =
    me.ratingDisplayScale === 'ZERO_TO_TEN'
      ? 'Ratings are displayed and entered as 0–10 (e.g. 4.7). Stored internally as 0–100.'
      : 'Ratings are displayed and entered as 0–100 (e.g. 47).'

  return (
    <SettingsSection title="Rating">
      <SettingStack label="Rating mode" description={modeDescription}>
        <Segmented
          options={[
            { value: 'SIMPLE', label: 'Simple' },
            { value: 'WEIGHTED', label: 'Weighted' },
          ]}
          value={me.ratingMode}
          onChange={(v) => void handleModeChange(v as RatingMode)}
        />
      </SettingStack>

      <SettingStack label="Display scale" description={scaleDescription}>
        <Segmented
          options={[
            { value: 'ZERO_TO_TEN', label: '0–10' },
            { value: 'ZERO_TO_HUNDRED', label: '0–100' },
          ]}
          value={me.ratingDisplayScale}
          onChange={(v) => void handleScaleChange(v as RatingDisplayScale)}
        />
      </SettingStack>

      {me.ratingMode === 'WEIGHTED' && (
        <SettingStack
          label="Categories"
          description="Each category contributes to the weighted average proportional to its weight. Active weights must sum to exactly 1.0."
        >
          <RatingConfigEditor me={me} />
        </SettingStack>
      )}
    </SettingsSection>
  )
}

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[]
  value: T
  onChange: (next: T) => void
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="inline-flex rounded-md border border-[var(--color-border)] bg-card p-1">
      {options.map((o) => (
        <Button
          key={o.value}
          variant="ghost"
          size="sm"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-sm px-4',
            o.value === value &&
              'bg-primary text-primary-foreground hover:bg-[var(--color-primary-hover)] hover:text-primary-foreground'
          )}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}
