import { Segmented } from '@/components/generic/segmented'
import { RangeRow } from '@/components/inputs/RangeRow'
import type { SearchPageState } from '@/lib/levelSearchParams'
import { BoundInputs } from './BoundInputs'
import { FilterGroup } from './FilterGroup'
import type { RangeFilterConfig } from './rangeFilters'
import { RANGE_MODES, useRangeFilter } from './useRangeFilter'

/**
 * One range filter: a slider or a pair of boxes depending on the field, with a
 * visible Range/Exact switch beside its label where the field offers one.
 * Exact narrows the slider to one thumb and the boxes to one box. Each control
 * is keyed on the mode so a half-typed box or an in-flight drag doesn't carry
 * across the switch.
 */
export function RangeFilter({
  cfg,
  state,
  onChange,
}: {
  cfg: RangeFilterConfig
  state: SearchPageState
  onChange: (patch: Partial<SearchPageState>) => void
}) {
  const { mode, setMode, canSwitch, view } = useRangeFilter({
    cfg,
    state,
    onChange,
  })

  return (
    <FilterGroup
      label={cfg.label}
      action={
        canSwitch ? (
          <Segmented
            size="xs"
            fill={false}
            className="gap-1"
            options={RANGE_MODES}
            value={mode}
            onChange={setMode}
          />
        ) : null
      }
    >
      {view.kind === 'slider' ? (
        <RangeRow
          key={mode}
          label={view.cfg.label}
          hideLabel
          className="px-0 py-0"
          min={view.cfg.domain[0]}
          max={view.cfg.domain[1]}
          step={view.cfg.step}
          single={mode === 'exact'}
          commitOnRelease
          value={view.value}
          onChange={view.onChange}
          format={view.cfg.format}
          trackClassName={view.cfg.trackClassName}
          trackStyle={view.cfg.trackStyle}
        />
      ) : (
        <BoundInputs
          key={mode}
          cfg={view.cfg}
          exact={mode === 'exact'}
          value={view.value}
          onChange={view.onChange}
        />
      )}
    </FilterGroup>
  )
}
