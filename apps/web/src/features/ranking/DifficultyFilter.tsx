import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { difficultyFaceSrc } from '@/lib/gdAssets'
import { cn } from '@/lib/utils'
import {
  DEMON_DIFFICULTIES,
  NON_DEMON,
  NON_DEMON_DIFFICULTIES,
} from './rankingModel'

interface DifficultyFilterProps {
  selected: readonly string[]
  onToggle: (difficulty: string) => void
  onClear: () => void
}

/**
 * The difficulty filter strip: All, then non-demon, then the five demon
 * difficulties in game order.
 *
 * Non-demon difficulties are collapsed behind their own control because this is
 * a demon tracker — a user has five demon difficulties they filter by often and
 * six others they almost never do, and giving all eleven equal billing would
 * make the common case harder to hit.
 */
export function DifficultyFilter({
  selected,
  onToggle,
  onClear,
}: DifficultyFilterProps) {
  // Two independent inputs, deliberately not one flag. Hover opens the strip on
  // a pointer device; the chevron pins it open for a touch device that has no
  // hover at all. Folding them into a single toggle makes the chevron close
  // what the cursor is still holding open, which is worse than having no
  // chevron.
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const expanded = hovered || pinned
  const nonDemonSelected = selected.includes(NON_DEMON)
  const anyNonDemonPicked = NON_DEMON_DIFFICULTIES.some((d) =>
    selected.includes(d)
  )

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

      {/* The strip drops BELOW the control rather than expanding along the row.
          Expanding sideways either shoves the demon buttons out from under the
          cursor or covers them entirely, and both read as the demons
          disappearing the moment you approach them. */}
      <div
        className="relative flex items-center gap-1"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setHovered(false)
            setPinned(false)
          }
        }}
      >
        <DifficultyButton
          label="Non-demon"
          difficulty={null}
          selected={nonDemonSelected}
          onToggle={() => onToggle(NON_DEMON)}
        />
        <button
          type="button"
          onClick={() => setPinned((v) => !v)}
          aria-expanded={expanded}
          aria-label="Show non-demon difficulties"
          title="Non-demon difficulties"
          className={cn(
            'flex h-8 w-5 items-center justify-center rounded-btn transition-colors',
            anyNonDemonPicked
              ? 'text-primary'
              : 'text-text-tertiary hover:bg-bg-elevated hover:text-text-primary'
          )}
        >
          <ChevronDown
            size={12}
            className={cn('transition-transform', expanded && 'rotate-180')}
          />
        </button>

        {expanded && (
          <div className="absolute left-0 top-full z-30 mt-1 flex items-center gap-1 rounded-btn border border-border-subtle bg-bg-elevated p-1 shadow-lg">
            {NON_DEMON_DIFFICULTIES.map((difficulty) => (
              <DifficultyButton
                key={difficulty}
                label={difficulty}
                difficulty={difficulty}
                selected={selected.includes(difficulty)}
                onToggle={() => onToggle(difficulty)}
              />
            ))}
          </div>
        )}
      </div>

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
 * @param difficulty - The `inGameDifficulty` whose face to show, or null for
 * the non-demon aggregate, which has no single face of its own and so wears the
 * plain unrated one.
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
