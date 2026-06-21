import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DifficultyFace } from '@/components/DifficultyFace'
import type { Level } from '@/lib/api/logging'
import { useLoggingFlow } from './LoggingFlowProvider'

// Scrollable content region of a step. The panel is a flex column; this grows
// to fill the space between the fixed header and the sticky footer.
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

// Sticky bottom action bar (Back on the left, primary action on the right).
export function StepFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
      {children}
    </div>
  )
}

export function FieldLabel({
  children,
  hint,
  htmlFor,
  className,
}: {
  children: ReactNode
  hint?: string
  htmlFor?: string
  className?: string
}) {
  return (
    <div className={cn('mb-1.5 flex items-center gap-1.5', className)}>
      <Label htmlFor={htmlFor}>{children}</Label>
      {hint && (
        <span title={hint} className="text-text-tertiary">
          <Info size={13} />
        </span>
      )}
    </div>
  )
}

export function FieldHint({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs text-text-tertiary">{children}</p>
}

// Small uppercase divider used inside the session/list steps (STATS, FLAGS…).
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
      {children}
    </p>
  )
}

// The "Bloodbath · by Riot · At the Speed of Light  [Change]" row that sits atop
// every post-resolve step. No surrounding box — it reads against the modal's
// level-thumbnail backdrop. "Change" returns to the find step.
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
        className="text-primary hover:bg-[var(--color-primary-dim)] hover:text-primary"
      >
        Change
      </Button>
    </div>
  )
}
