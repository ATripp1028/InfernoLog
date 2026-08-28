import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/generic/button'
import { Switch } from '@/components/generic/switch'
import { DifficultyFace } from '@/components/data/DifficultyFace'
import type { Level } from '@/lib/api/logging'
import { useLoggingFlow } from '@/context/LoggingFlowContext'

export { FieldError } from '@/components/generic/field-error'
export { SectionLabel } from '@/components/inputs/SectionLabel'
export { FieldLabel, FieldHint } from '@/components/inputs/FieldLabel'
export { DateTimeField } from '@/components/inputs/DateTimeField'

/**
 * Scrollable content region of a step. The panel is a flex column; this grows
 * to fill the space between the fixed header and the sticky footer.
 */
export function StepBody({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn('flex-1 space-y-5 overflow-y-auto px-6 py-5', className)}
    >
      {children}
    </div>
  )
}

/**
 * Sticky bottom action bar (Back on the left, primary action on the right).
 */
export function StepFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
      {children}
    </div>
  )
}

/**
 * A labelled switch row (STATS/FLAGS toggles: "Played on stream", "Keep this
 * private"). Both session steps had their own copy; the completion step's had
 * grown a `subtitle` the progress step's had not.
 */
export function ToggleRow({
  title,
  subtitle,
  checked,
  onChange,
}: {
  title: string
  subtitle?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-text-primary">{title}</p>
        {subtitle && <p className="text-xs text-text-tertiary">{subtitle}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

/**
 * The "Bloodbath · by Riot · At the Speed of Light  [Change]" row that sits atop
 * every post-resolve step. No surrounding box — it reads against the modal's
 * level-thumbnail backdrop. "Change" returns to the find step.
 */
export function LevelHeader({ level }: { level: Level }) {
  const { setStep } = useLoggingFlow()
  const subtitle = [
    level.creator ? `by ${level.creator}` : null,
    level.songName,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <DifficultyFace
          difficulty={level.inGameDifficulty}
          featured={level.featured}
          epicValue={level.epicValue}
          rated={level.isRated}
          size={120}
          className="drop-shadow"
        />
        <div>
          <p className="font-semibold leading-tight text-text-primary">
            {level.name ?? `Level #${level.inGameId}`}
          </p>
          {subtitle && (
            <p className="text-xs text-text-secondary">{subtitle}</p>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setStep('find')}
        className="text-primary hover:bg-primary-dim hover:text-primary"
      >
        Change
      </Button>
    </div>
  )
}
