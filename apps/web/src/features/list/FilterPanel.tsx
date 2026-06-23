import { X } from 'lucide-react'
import type { RatingDisplayScale } from '@/lib/api/me'
import { Chip } from '@/components/ui/chip'
import { RangeSlider } from '@/components/ui/range-slider'
import { displayMax, formatRating, formatNumber } from '@/features/logging/format'
import { FilterSection } from './FilterSection'
import { gddlTrackGradient } from './tierColor'
import {
  ATTEMPTS_DOMAIN,
  DATE_MIN_MS,
  RATING_DOMAIN,
  TIER_DOMAIN,
  dateDomain,
  defaultFilterState,
  type FilterState,
  type ListSourceFilter,
  type LevelTypeFilter,
  type ProgressStatus,
  type Range,
  type RatedStatusFilter,
  type StatusFlag,
} from './types'

interface FilterPanelProps {
  filters: FilterState
  onChange: (next: FilterState) => void
  matchCount: number
  totalCount: number
  scale: RatingDisplayScale
  // Distinct values present in the data, for the chip filters.
  availableLengths: string[]
  availableGameVersions: string[]
  availableDifficulties: string[]
  onClose?: () => void
}

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
}

const PROGRESS: { value: ProgressStatus; label: string }[] = [
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'DROPPED', label: 'Dropped' },
]
const SOURCES: ListSourceFilter[] = ['GDDL', 'AREDL', 'NLW']
const LEVEL_TYPES: { value: LevelTypeFilter; label: string }[] = [
  { value: 'CLASSIC', label: 'Classic' },
  { value: 'PLATFORMER', label: 'Platformer' },
]
const RATED_STATUSES: RatedStatusFilter[] = [
  'ALL',
  'UNRATED',
  'RATED',
  'FEATURED',
  'EPIC',
  'LEGENDARY',
  'MYTHIC',
]
const FLAGS: { value: StatusFlag; label: string }[] = [
  { value: 'hasVideo', label: 'Has video' },
  { value: 'onStream', label: 'On stream' },
  { value: 'uncertainDate', label: 'Uncertain date' },
  { value: 'needsPlacement', label: 'Needs placement' },
]
const LEVEL_FLAGS: { value: StatusFlag; label: string }[] = [
  { value: 'twoPlayer', label: 'Two player' },
  { value: 'hasCoins', label: 'Has coins' },
  { value: 'verifiedCoins', label: 'Verified coins' },
]

function RangeRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
  trackClassName,
  trackStyle,
}: {
  label: string
  min: number
  max: number
  step: number
  value: Range
  onChange: (v: Range) => void
  format: (v: number, end: 'min' | 'max') => string
  trackClassName?: string | undefined
  trackStyle?: React.CSSProperties | undefined
}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-1.5">
      <p className="text-xs font-medium text-text-secondary">{label}</p>
      <RangeSlider
        min={min}
        max={max}
        step={step}
        value={value}
        onValueChange={(v) => onChange([v[0]!, v[1]!])}
        trackClassName={trackClassName}
        trackStyle={trackStyle}
      />
      <div className="flex justify-between text-[11px] text-text-tertiary">
        <span>{format(value[0], 'min')}</span>
        <span>{format(value[1], 'max')}</span>
      </div>
    </div>
  )
}

function monthYear(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  })
}

export function FilterPanel({
  filters,
  onChange,
  matchCount,
  totalCount,
  scale,
  availableLengths,
  availableGameVersions,
  availableDifficulties,
  onClose,
}: FilterPanelProps) {
  const set = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch })
  const max = displayMax(scale)
  // dateDomain() reads "now"; routed through the helper so the render stays
  // free of a direct (impure) Date.now() call.
  const today = dateDomain()[1]

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-surface)]">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border-subtle)] px-3">
        <button
          type="button"
          onClick={() => onChange(defaultFilterState())}
          className="rounded px-2 py-1 text-[13px] font-medium text-primary"
        >
          Clear all
        </button>
        <p className="text-[15px] font-semibold text-text-primary">Filters</p>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="rounded px-2 py-1 text-text-secondary"
          >
            <X size={16} />
          </button>
        ) : (
          <span className="w-12" />
        )}
      </div>

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FilterSection title="Progress">
          <div className="flex flex-wrap gap-1.5 px-4">
            {PROGRESS.map((p) => (
              <Chip
                key={p.value}
                selected={filters.statuses.includes(p.value)}
                onClick={() => set({ statuses: toggle(filters.statuses, p.value) })}
              >
                {p.label}
              </Chip>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Rating">
          <RangeRow
            label="Rating"
            min={RATING_DOMAIN[0]}
            max={RATING_DOMAIN[1]}
            step={1}
            value={filters.rating}
            onChange={(rating) => set({ rating })}
            format={(v) => formatRating(v, scale)}
          />
          <RangeRow
            label="Enjoyment"
            min={RATING_DOMAIN[0]}
            max={RATING_DOMAIN[1]}
            step={1}
            value={filters.enjoyment}
            onChange={(enjoyment) => set({ enjoyment })}
            format={(v) => formatRating(v, scale)}
          />
          <p className="px-4 pt-1 text-[10px] text-text-tertiary">
            Scale 0–{max}
          </p>
        </FilterSection>

        <FilterSection title="List Source">
          <div className="flex flex-wrap gap-1.5 px-4">
            {SOURCES.map((s) => (
              <Chip
                key={s}
                selected={filters.listSources.includes(s)}
                onClick={() => set({ listSources: toggle(filters.listSources, s) })}
              >
                {s}
              </Chip>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="GDDL Tier">
          <RangeRow
            label="Tier range"
            min={TIER_DOMAIN[0]}
            max={TIER_DOMAIN[1]}
            step={1}
            value={filters.tier}
            onChange={(tier) => set({ tier })}
            format={(v) => (v >= TIER_DOMAIN[1] ? '35+' : String(v))}
            trackClassName="bg-transparent"
            trackStyle={{
              backgroundImage: gddlTrackGradient(TIER_DOMAIN[0], TIER_DOMAIN[1]),
            }}
          />
        </FilterSection>

        <FilterSection title="Date Beaten">
          <RangeRow
            label="Date range"
            min={DATE_MIN_MS}
            max={today}
            step={86_400_000}
            value={filters.dateBeaten}
            onChange={(dateBeaten) => set({ dateBeaten })}
            format={(v, end) =>
              end === 'max' && today - v < 2 * 86_400_000 ? 'Today' : monthYear(v)
            }
          />
        </FilterSection>

        <FilterSection title="Attempts">
          <RangeRow
            label="Attempt range"
            min={ATTEMPTS_DOMAIN[0]}
            max={ATTEMPTS_DOMAIN[1]}
            step={100}
            value={filters.attempts}
            onChange={(attempts) => set({ attempts })}
            format={(v) =>
              v >= ATTEMPTS_DOMAIN[1] ? '25,000+' : formatNumber(v)
            }
          />
        </FilterSection>

        <FilterSection title="Level Type">
          <div className="flex flex-wrap gap-1.5 px-4">
            {LEVEL_TYPES.map((t) => (
              <Chip
                key={t.value}
                selected={filters.levelTypes.includes(t.value)}
                onClick={() =>
                  set({ levelTypes: toggle(filters.levelTypes, t.value) })
                }
              >
                {t.label}
              </Chip>
            ))}
          </div>
        </FilterSection>

        {availableDifficulties.length > 0 && (
          <FilterSection title="Difficulty">
            <div className="flex flex-wrap gap-1.5 px-4">
              {availableDifficulties.map((d) => (
                <Chip
                  key={d}
                  selected={filters.difficulties.includes(d)}
                  onClick={() =>
                    set({ difficulties: toggle(filters.difficulties, d) })
                  }
                >
                  {d}
                </Chip>
              ))}
            </div>
          </FilterSection>
        )}

        <FilterSection title="Rating Status">
          <div className="flex flex-wrap gap-1.5 px-4">
            {RATED_STATUSES.map((s) => (
              <Chip
                key={s}
                selected={filters.ratedStatus === s}
                onClick={() => set({ ratedStatus: s })}
              >
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </Chip>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Status Flags">
          <div className="flex flex-wrap gap-1.5 px-4">
            {FLAGS.map((f) => (
              <Chip
                key={f.value}
                selected={filters.flags.includes(f.value)}
                onClick={() => set({ flags: toggle(filters.flags, f.value) })}
              >
                {f.label}
              </Chip>
            ))}
          </div>
        </FilterSection>

        {availableLengths.length > 0 && (
          <FilterSection title="Length">
            <div className="flex flex-wrap gap-1.5 px-4">
              {availableLengths.map((len) => (
                <Chip
                  key={len}
                  selected={filters.lengths.includes(len)}
                  onClick={() => set({ lengths: toggle(filters.lengths, len) })}
                >
                  {len}
                </Chip>
              ))}
            </div>
          </FilterSection>
        )}

        {availableGameVersions.length > 0 && (
          <FilterSection title="Game Version">
            <div className="flex flex-wrap gap-1.5 px-4">
              {availableGameVersions.map((v) => (
                <Chip
                  key={v}
                  selected={filters.gameVersions.includes(v)}
                  onClick={() =>
                    set({ gameVersions: toggle(filters.gameVersions, v) })
                  }
                >
                  {v}
                </Chip>
              ))}
            </div>
          </FilterSection>
        )}

        <FilterSection title="Level">
          <div className="flex flex-wrap gap-1.5 px-4">
            {LEVEL_FLAGS.map((f) => (
              <Chip
                key={f.value}
                selected={filters.flags.includes(f.value)}
                onClick={() => set({ flags: toggle(filters.flags, f.value) })}
              >
                {f.label}
              </Chip>
            ))}
          </div>
        </FilterSection>
      </div>

      {/* Footer */}
      <div className="flex h-12 shrink-0 items-center justify-between border-t border-[var(--color-border-subtle)] px-4">
        <p className="text-xs font-medium text-text-secondary">
          {matchCount} of {totalCount} levels match
        </p>
        <button
          type="button"
          onClick={() => onChange(defaultFilterState())}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-xs font-medium text-text-primary"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
