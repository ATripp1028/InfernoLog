import { useState, useRef } from 'react'
import { X, Calendar } from 'lucide-react'
import type { DateFormatPreference, RatingCategory, RatingDisplayScale } from '@/lib/api/me'
import { Chip } from '@/components/ui/chip'
import { RangeSlider } from '@/components/ui/range-slider'
import { cn } from '@/lib/utils'
import { difficultyFaceSrc } from '@/lib/gdAssets'
import { formatDate } from '@/lib/dateFormat'
import {
  displayMax,
  formatRating,
  formatNumber,
  toInternal,
} from '@/features/logging/format'
import { FilterSection } from './FilterSection'
import { gddlTrackGradient } from './tierColor'
import {
  ATTEMPTS_DOMAIN,
  RATING_DOMAIN,
  TIER_DOMAIN,
  defaultFilterState,
  type DateBounds,
  type FilterState,
  type DeviceFilter,
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
  dateFormatPreference: DateFormatPreference
  // Distinct values present in the data, for the chip filters.
  availableLengths: string[]
  availableGameVersions: string[]
  availableDifficulties: string[]
  // Data-driven slider bounds.
  earliestDate: number
  maxAttempts: number
  // Rating categories for per-category range filters (WEIGHTED mode only).
  ratingCategories?: RatingCategory[]
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
const LEVEL_TYPES: { value: LevelTypeFilter; label: string }[] = [
  { value: 'CLASSIC', label: 'Classic' },
  { value: 'PLATFORMER', label: 'Platformer' },
]
const DEVICES: { value: DeviceFilter; label: string }[] = [
  { value: 'pc', label: 'PC' },
  { value: 'mobile', label: 'Mobile' },
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

// Parses a date string in the user's preferred format to epoch ms.
function parseFilterDate(
  text: string,
  pref: DateFormatPreference
): number | null {
  const t = text.trim()
  const sep = pref === 'ISO' ? '-' : '/'
  const parts = t.split(sep)
  if (parts.length !== 3) return null

  let y: number, m: number, d: number
  if (pref === 'ISO' || pref === 'YMD') {
    y = parseInt(parts[0]!, 10)
    m = parseInt(parts[1]!, 10) - 1
    d = parseInt(parts[2]!, 10)
  } else if (pref === 'DMY') {
    d = parseInt(parts[0]!, 10)
    m = parseInt(parts[1]!, 10) - 1
    y = parseInt(parts[2]!, 10)
  } else {
    // MDY
    m = parseInt(parts[0]!, 10) - 1
    d = parseInt(parts[1]!, 10)
    y = parseInt(parts[2]!, 10)
  }

  if (isNaN(y) || isNaN(m) || isNaN(d)) return null
  const date = new Date(y, m, d)
  // Verify no date overflow (e.g. Feb 30 wrapping to Mar 2)
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d)
    return null
  return date.getTime()
}

// Epoch ms → YYYY-MM-DD for <input type="date"> value prop.
function toIso(ms: number): string {
  const d = new Date(ms)
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

const inputCls =
  'w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-[11px] text-center text-text-primary outline-none focus:border-primary transition-colors'

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
  parseInput,
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
  parseInput?: ((text: string, end: 'min' | 'max') => number | null) | undefined
}) {
  const [minDraft, setMinDraft] = useState<string | null>(null)
  const [maxDraft, setMaxDraft] = useState<string | null>(null)

  function commitMin(text: string) {
    setMinDraft(null)
    if (!parseInput) return
    const n = parseInput(text, 'min')
    if (n == null) return
    onChange([Math.min(Math.max(n, min), value[1]), value[1]])
  }

  function commitMax(text: string) {
    setMaxDraft(null)
    if (!parseInput) return
    const n = parseInput(text, 'max')
    if (n == null) return
    onChange([value[0], Math.max(Math.min(n, max), value[0])])
  }

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
      {parseInput ? (
        <div className="flex gap-1.5">
          <input
            className={inputCls}
            value={minDraft ?? format(value[0], 'min')}
            onChange={(e) => setMinDraft(e.target.value)}
            onBlur={(e) => commitMin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitMin(e.currentTarget.value)
            }}
          />
          <input
            className={inputCls}
            value={maxDraft ?? format(value[1], 'max')}
            onChange={(e) => setMaxDraft(e.target.value)}
            onBlur={(e) => commitMax(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitMax(e.currentTarget.value)
            }}
          />
        </div>
      ) : (
        <div className="flex justify-between text-[11px] text-text-tertiary">
          <span>{format(value[0], 'min')}</span>
          <span>{format(value[1], 'max')}</span>
        </div>
      )}
    </div>
  )
}

function DatePickerField({
  label,
  value,
  onChange,
  datePref,
  min,
  max,
  placeholder,
}: {
  label: string
  value: number | null
  onChange: (ms: number | null) => void
  datePref: DateFormatPreference
  min?: number
  max?: number
  placeholder: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const calRef = useRef<HTMLInputElement>(null)

  function fmt(ms: number): string {
    return formatDate(new Date(ms), datePref)
  }

  function commit(text: string) {
    setDraft(null)
    if (!text.trim()) { onChange(null); return }
    const n = parseFilterDate(text, datePref)
    if (n == null) return
    let clamped = n
    if (min != null) clamped = Math.max(clamped, min)
    if (max != null) clamped = Math.min(clamped, max)
    onChange(clamped)
  }

  function handleCal(isoVal: string) {
    if (!isoVal) return
    const [y, m, d] = isoVal.split('-').map(Number)
    const ms = new Date(y!, m! - 1, d!).getTime()
    if (!isNaN(ms)) onChange(ms)
  }

  function showPicker(ref: React.RefObject<HTMLInputElement | null>) {
    try {
      ;(ref.current as HTMLInputElement & { showPicker?: () => void })?.showPicker?.()
    } catch {
      // showPicker() may throw without a user gesture or in hidden elements
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-0.5">
      <p className="text-[10px] text-text-tertiary">{label}</p>
      <div className="relative flex items-center">
        <input
          className={cn(inputCls, 'pr-9')}
          value={draft ?? (value != null ? fmt(value) : '')}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value)
          }}
        />
        <button
          type="button"
          className={cn(
            'absolute cursor-pointer text-text-tertiary transition-colors hover:text-text-primary',
            value != null ? 'right-5' : 'right-1.5'
          )}
          onClick={() => showPicker(calRef)}
          aria-label="Open calendar"
        >
          <Calendar size={11} />
        </button>
        {value != null && (
          <button
            type="button"
            className="absolute right-1 cursor-pointer text-text-tertiary transition-colors hover:text-text-primary"
            onClick={() => { setDraft(null); onChange(null) }}
            aria-label={`Clear ${label}`}
          >
            <X size={10} />
          </button>
        )}
        <input
          ref={calRef}
          type="date"
          tabIndex={-1}
          className="pointer-events-none absolute h-px w-px opacity-0"
          value={value != null ? toIso(value) : ''}
          {...(min != null && { min: toIso(min) })}
          {...(max != null && { max: toIso(max) })}
          onChange={(e) => handleCal(e.target.value)}
        />
      </div>
    </div>
  )
}

function DatePickersRow({
  value,
  onChange,
  datePref,
  minDate,
}: {
  value: DateBounds
  onChange: (v: DateBounds) => void
  datePref: DateFormatPreference
  minDate: number
}) {
  const today = Date.now()
  return (
    <div className="flex gap-2 px-4 py-1.5">
      <DatePickerField
        label="From"
        value={value.from}
        onChange={(from) => onChange({ ...value, from })}
        datePref={datePref}
        min={minDate}
        max={value.to ?? today}
        placeholder="Any"
      />
      <DatePickerField
        label="To"
        value={value.to}
        onChange={(to) => onChange({ ...value, to })}
        datePref={datePref}
        min={value.from ?? minDate}
        max={today}
        placeholder="Today"
      />
    </div>
  )
}

export function FilterPanel({
  filters,
  onChange,
  matchCount,
  totalCount,
  scale,
  dateFormatPreference,
  availableLengths,
  availableGameVersions,
  availableDifficulties,
  earliestDate,
  maxAttempts,
  ratingCategories,
  onClose,
}: FilterPanelProps) {
  const set = (patch: Partial<FilterState>) =>
    onChange({ ...filters, ...patch })
  const max = displayMax(scale)

  function parseRating(text: string): number | null {
    const v = parseFloat(text)
    if (isNaN(v)) return null
    return Math.min(
      RATING_DOMAIN[1],
      Math.max(RATING_DOMAIN[0], toInternal(v, scale))
    )
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-surface)]">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border-subtle)] px-3">
        <button
          type="button"
          onClick={() => onChange(defaultFilterState())}
          className="rounded px-2 py-1 text-[13px] font-medium text-primary cursor-pointer"
        >
          Clear all
        </button>
        <p className="text-[15px] font-semibold text-text-primary">Filters</p>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="rounded px-2 py-1 text-text-secondary cursor-pointer"
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
                className="cursor-pointer"
                selected={filters.statuses.includes(p.value)}
                onClick={() =>
                  set({ statuses: toggle(filters.statuses, p.value) })
                }
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
            parseInput={parseRating}
          />
          <RangeRow
            label="Enjoyment"
            min={RATING_DOMAIN[0]}
            max={RATING_DOMAIN[1]}
            step={1}
            value={filters.enjoyment}
            onChange={(enjoyment) => set({ enjoyment })}
            format={(v) => formatRating(v, scale)}
            parseInput={parseRating}
          />
          {ratingCategories &&
            [...ratingCategories]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((cat) => (
                <RangeRow
                  key={cat.id}
                  label={cat.name}
                  min={RATING_DOMAIN[0]}
                  max={RATING_DOMAIN[1]}
                  step={1}
                  value={
                    (filters.categoryRatings ?? {})[cat.id] ?? RATING_DOMAIN
                  }
                  onChange={(range) =>
                    set({
                      categoryRatings: {
                        ...(filters.categoryRatings ?? {}),
                        [cat.id]: range,
                      },
                    })
                  }
                  format={(v) => formatRating(v, scale)}
                  parseInput={parseRating}
                />
              ))}
          <p className="px-4 pt-1 text-[10px] text-text-tertiary">
            Scale 0–{max}
          </p>
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
            parseInput={(text) => {
              const v = parseInt(text.replace('+', ''), 10)
              if (isNaN(v)) return null
              return Math.min(TIER_DOMAIN[1], Math.max(TIER_DOMAIN[0], v))
            }}
            trackClassName="bg-transparent"
            trackStyle={{
              backgroundImage: gddlTrackGradient(
                TIER_DOMAIN[0],
                TIER_DOMAIN[1]
              ),
            }}
          />
        </FilterSection>

        <FilterSection title="Date Beaten">
          <DatePickersRow
            value={filters.dateBeaten}
            onChange={(dateBeaten) => set({ dateBeaten })}
            datePref={dateFormatPreference}
            minDate={earliestDate}
          />
        </FilterSection>

        <FilterSection title="Attempts">
          <RangeRow
            label="Attempt range"
            min={ATTEMPTS_DOMAIN[0]}
            max={maxAttempts}
            step={100}
            value={filters.attempts}
            onChange={(attempts) => set({ attempts })}
            format={(v) => formatNumber(v)}
            parseInput={(text) => {
              const v = parseInt(text.replace(/,/g, ''), 10)
              if (isNaN(v)) return null
              return Math.min(maxAttempts, Math.max(0, v))
            }}
          />
        </FilterSection>

        <FilterSection title="Level Type">
          <div className="flex flex-wrap gap-1.5 px-4">
            {LEVEL_TYPES.map((t) => (
              <Chip
                key={t.value}
                className="cursor-pointer"
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

        <FilterSection title="Device">
          <div className="flex flex-wrap gap-1.5 px-4">
            {DEVICES.map((d) => (
              <Chip
                key={d.value}
                className="cursor-pointer"
                selected={filters.devices.includes(d.value)}
                onClick={() =>
                  set({ devices: toggle(filters.devices, d.value) })
                }
              >
                {d.label}
              </Chip>
            ))}
          </div>
        </FilterSection>

        {availableDifficulties.length > 0 && (
          <FilterSection title="Difficulty">
            <div className="grid grid-cols-5 gap-1 px-4">
              {availableDifficulties.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={filters.difficulties.includes(d)}
                  onClick={() =>
                    set({ difficulties: toggle(filters.difficulties, d) })
                  }
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-md p-1 cursor-pointer transition-colors',
                    filters.difficulties.includes(d)
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-text-secondary hover:text-text-primary'
                  )}
                >
                  <img
                    src={difficultyFaceSrc(d)}
                    alt={d}
                    className="h-7 w-7 object-contain"
                    draggable={false}
                  />
                  <span className="text-center text-[8px] leading-tight line-clamp-2">
                    {d}
                  </span>
                </button>
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
                className="cursor-pointer"
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
                className="cursor-pointer"
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
                  className="cursor-pointer"
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
                  className="cursor-pointer"
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
                className="cursor-pointer"
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
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1.5 text-xs font-medium text-text-primary cursor-pointer"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
