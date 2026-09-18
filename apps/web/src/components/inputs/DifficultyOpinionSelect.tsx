// "What difficulty do you think it is?" picker, shared by the logging flow's
// completion step and the level page's edit-run modal — both ask the same
// question about the same field, so they render the same control.
//
// Five demon tiers as round face buttons, plus a labelled "Not demon-worthy"
// button: most levels logged here are demons to someone, so that path stays
// secondary. It used to carry a star count (1-9) saying which non-demon
// difficulty the user would have given it; that was dropped along with
// non-demon support, and the answer is now the single NOT_DEMON_WORTHY value.

import { cn } from '@/lib/utils'
import { segmentedItemVariants } from '@/components/generic/segmented'
import { difficultyFaceSrc } from '@/lib/gdAssets'
import type { DifficultyOpinion } from '@/lib/api/wireEnums'

/**
 * The five demon tiers as face buttons, easiest first.
 */
// Faces come from the shared label→asset mapping rather than hardcoded paths,
// so a renamed sprite cannot leave this picker pointing at a 404 while every
// other difficulty face in the app moves.
export const DEMON_OPINIONS = [
  { value: 'EASY', label: 'Easy Demon' },
  { value: 'MEDIUM', label: 'Medium Demon' },
  { value: 'HARD', label: 'Hard Demon' },
  { value: 'INSANE', label: 'Insane Demon' },
  { value: 'EXTREME', label: 'Extreme Demon' },
].map((o) => ({ ...o, face: difficultyFaceSrc(o.label) })) as ReadonlyArray<{
  value: DifficultyOpinion
  label: string
  face: string
}>

/**
 * The difficulty-opinion picker.
 *
 * @param value - `null` when the user has not answered. One field: picking a
 * demon tier replaces "not demon-worthy" and vice versa.
 */
export function DifficultyOpinionSelect({
  value,
  onChange,
}: {
  value: DifficultyOpinion | null
  onChange: (value: DifficultyOpinion) => void
}) {
  const notWorthy = value === 'NOT_DEMON_WORTHY'
  return (
    <div className="space-y-3">
      {/* Demon difficulty faces — one row, evenly spaced across the width. */}
      <div className="grid grid-cols-5 justify-items-center gap-2">
        {DEMON_OPINIONS.map((opt) => {
          const active = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              aria-label={opt.label}
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className={cn(
                'flex size-12 items-center justify-center rounded-full border transition-all',
                active
                  ? 'border-primary bg-primary/20 ring-2 ring-primary'
                  : 'border-border bg-bg-elevated/50 hover:bg-bg-elevated/80'
              )}
            >
              <img src={opt.face} alt="" className="size-8" />
            </button>
          )
        })}
      </div>

      {/* "Not demon-worthy" on its own row so it never wraps the face row. */}
      <button
        type="button"
        aria-pressed={notWorthy}
        onClick={() => onChange('NOT_DEMON_WORTHY')}
        className={cn(
          segmentedItemVariants({ active: notWorthy }),
          'h-10 w-full'
        )}
      >
        Not demon-worthy
      </button>
    </div>
  )
}
