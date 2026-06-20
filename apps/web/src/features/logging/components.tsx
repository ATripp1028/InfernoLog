import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { difficultyFaceSrc, levelThumbnailUrl } from '@/lib/gdAssets'
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
    <div className={cn('flex-1 space-y-5 overflow-y-auto px-6 py-5', className)}>
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

// The "Bloodbath · by Riot · At the Speed of Light  [Change]" banner that sits
// atop every post-resolve step: the level thumbnail as a backdrop, the
// difficulty face, and a "Change" link back to the find step.
export function LevelHeader({ level }: { level: Level }) {
  const { setStep } = useLoggingFlow()
  const subtitle = [level.creator ? `by ${level.creator}` : null, level.songName]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="relative flex items-center justify-between gap-4 overflow-hidden rounded-md border border-border-subtle bg-bg-surface px-4 py-3">
      {/* Level thumbnail backdrop; hidden if it fails to load. */}
      <img
        src={levelThumbnailUrl(level.inGameId)}
        alt=""
        aria-hidden
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
        className="absolute inset-0 size-full object-cover"
      />
      <span className="absolute inset-0 bg-gradient-to-r from-bg-base/95 via-bg-base/85 to-bg-base/55" />

      <div className="relative flex items-center gap-3">
        <img
          src={difficultyFaceSrc(level.inGameDifficulty)}
          alt={level.inGameDifficulty ?? 'Difficulty'}
          className="size-9 shrink-0 drop-shadow"
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
      <button
        type="button"
        onClick={() => setStep('find')}
        className="relative text-sm font-medium text-primary hover:underline"
      >
        Change
      </button>
    </div>
  )
}
