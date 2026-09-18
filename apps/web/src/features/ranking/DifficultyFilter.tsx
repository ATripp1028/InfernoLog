import { difficultyFaceSrc } from '@/lib/gdAssets'
import { cn } from '@/lib/utils'
import { DEMON_DIFFICULTIES } from './rankingModel'

interface DifficultyFilterProps {
  selected: readonly string[]
  onToggle: (difficulty: string) => void
  onClear: () => void
}

/**
 * The difficulty filter strip: All, then the five demon difficulties in game
 * order.
 *
 * Nothing else is offered. A rated non-demon can't be logged, and an unrated
 * level has no difficulty of its own to filter by — the ranking's own "hide
 * unrated" toggle is how those are narrowed. Selecting any tier therefore hides
 * unrated completions, which is what picking a difficulty asks for.
 */
export function DifficultyFilter({
  selected,
  onToggle,
  onClear,
}: DifficultyFilterProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onClear}
        aria-pressed={selected.length === 0}
        title="Show every difficulty"
        className={cn(
          'h-8 rounded-btn px-2.5 text-xs font-medium transition-colors',
          selected.length === 0
            ? 'bg-primary text-text-primary'
            : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
        )}
      >
        All
      </button>

      {DEMON_DIFFICULTIES.map((difficulty) => (
        <DifficultyButton
          key={difficulty}
          label={difficulty}
          difficulty={difficulty}
          selected={selected.includes(difficulty)}
          onToggle={() => onToggle(difficulty)}
        />
      ))}
    </div>
  )
}

/**
 * One difficulty toggle.
 *
 * @param difficulty - The `inGameDifficulty` whose face to show.
 */
function DifficultyButton({
  label,
  difficulty,
  selected,
  onToggle,
}: {
  label: string
  difficulty: string | null
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-btn transition-colors',
        selected
          ? 'bg-primary'
          : 'opacity-60 hover:bg-bg-elevated hover:opacity-100'
      )}
    >
      <img
        src={difficultyFaceSrc(difficulty)}
        alt=""
        aria-hidden
        className="size-6 object-contain"
        draggable={false}
      />
    </button>
  )
}
