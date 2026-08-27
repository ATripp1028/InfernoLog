// The expanded halves of a feed row: an edit's field diffs, a bulk replace's
// impact rows, and a rating-config save's before/after.
//
// All three are the same idea — a before value, an arrow, an after value — so
// they share one row component rather than three near-identical ones.

import type {
  ActivityFeedEvent,
  ActivityFieldChange,
  ActivityLevelImpact,
} from '@infernolog/core'
import { SectionLabel } from '@/components/inputs/SectionLabel'
import type { RatingCategory } from '@/lib/api/me'
import { formatNumber } from '@/features/logging/format'
import {
  configCategoryLabel,
  fieldLabel,
  fieldValue,
  parseConfigCategories,
  type FieldValueContext,
} from './fieldLabels'
import { editSections, positionLabel } from './feedContent'

/** A value that was cleared, or never set. Distinct from a value of zero. */
function Absent() {
  return <span className="text-text-tertiary">—</span>
}

function Arrow() {
  return (
    <span aria-hidden className="px-1.5 text-text-tertiary">
      →
    </span>
  )
}

/**
 * One before → after line.
 *
 * @param emphasis - Marks a row the reader is meant to notice first: the two
 * derived figures a rating change produced, which describe what the save did
 * rather than what the user typed.
 */
function DiffRow({
  label,
  before,
  after,
  trailing,
  emphasis = false,
}: {
  label: string
  before: React.ReactNode
  after: React.ReactNode
  trailing?: React.ReactNode
  emphasis?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <span className="min-w-0 flex-1 truncate text-text-secondary">
        {label}
      </span>
      <span className="shrink-0 tabular-nums">
        <span className="text-text-tertiary">{before}</span>
        <Arrow />
        <span
          className={
            emphasis ? 'font-medium text-info-soft' : 'text-text-primary'
          }
        >
          {after}
        </span>
        {trailing}
      </span>
    </div>
  )
}

function FieldDiffRow({
  change,
  categories,
  context,
  emphasis,
}: {
  change: ActivityFieldChange
  categories: RatingCategory[]
  context: FieldValueContext
  emphasis?: boolean
}) {
  const before = fieldValue(change.fieldName, change.oldValue, context)
  const after = fieldValue(change.fieldName, change.newValue, context)
  return (
    <DiffRow
      label={fieldLabel(change.fieldName, categories)}
      before={before ?? <Absent />}
      after={after ?? <Absent />}
      emphasis={emphasis === true}
    />
  )
}

/**
 * An edit's field changes, grouped under the headings the logging flow itself
 * groups them by, with the two derived rating figures set apart.
 *
 * The weighted average and rating ranking are the knock-on effect of the save,
 * not part of what was typed — and neither is stored anywhere, so this is the
 * only place either can ever be seen.
 */
export function EditDetail({
  event,
  categories,
  context,
}: {
  event: ActivityFeedEvent
  categories: RatingCategory[]
  context: FieldValueContext
}) {
  const { sections, derived } = editSections(event)
  return (
    <div className="flex flex-col gap-3">
      {sections.map((section) => (
        <div key={section.heading}>
          <SectionLabel size="xs">{section.heading}</SectionLabel>
          <div className="mt-1">
            {section.rows.map((change) => (
              <FieldDiffRow
                key={change.fieldName}
                change={change}
                categories={categories}
                context={context}
              />
            ))}
          </div>
        </div>
      ))}
      {derived.length > 0 && (
        <div className="rounded-card bg-info-dim px-2.5 py-1.5">
          <SectionLabel size="xs">Knock-on effect</SectionLabel>
          <div className="mt-1">
            {derived.map((change) => (
              <FieldDiffRow
                key={change.fieldName}
                change={change}
                categories={categories}
                context={context}
                emphasis
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The levels a ranking event moved.
 *
 * A bulk replace can touch the whole ranking, so the response carries a capped
 * preview plus the true total — the trailing line says how many are not shown
 * rather than pretending the list is complete.
 */
export function ImpactDetail({ event }: { event: ActivityFeedEvent }) {
  const hidden = event.impactCount - event.levelImpacts.length
  return (
    <div>
      {event.levelImpacts.map((impact, i) => (
        <ImpactRow key={impact.levelId ?? `row-${i}`} impact={impact} />
      ))}
      {hidden > 0 && (
        <p className="pt-1.5 text-[11px] text-text-tertiary">
          and {formatNumber(hidden)} more level{hidden === 1 ? '' : 's'} this
          import touched.
        </p>
      )}
    </div>
  )
}

function ImpactRow({ impact }: { impact: ActivityLevelImpact }) {
  return (
    <DiffRow
      // Null only when the level has left the shared cache; the name was
      // snapshotted at write time so the row is still readable.
      label={impact.levelName ?? 'Unknown level'}
      before={positionLabel(impact.positionBefore)}
      after={
        impact.positionAfter === null ? (
          <span className="text-text-tertiary">out</span>
        ) : (
          positionLabel(impact.positionAfter)
        )
      }
    />
  )
}

/**
 * A rating-config save's before and after.
 *
 * The category list travels as one JSON row rather than one row per category,
 * so it renders as two columns rather than as a diff line.
 */
export function ConfigDetail({
  changes,
  categories,
  context,
}: {
  changes: ActivityFieldChange[]
  categories: RatingCategory[]
  context: FieldValueContext
}) {
  const categoryRow = changes.find((c) => c.fieldName === 'rating_categories')
  const scalars = changes.filter((c) => c.fieldName !== 'rating_categories')
  const before = parseConfigCategories(categoryRow?.oldValue ?? null)
  const after = parseConfigCategories(categoryRow?.newValue ?? null)

  return (
    <div className="flex flex-col gap-3">
      {scalars.map((change) => (
        <FieldDiffRow
          key={change.fieldName}
          change={change}
          categories={categories}
          context={context}
        />
      ))}
      {categoryRow && (
        <div>
          <SectionLabel size="xs">Categories</SectionLabel>
          <div className="mt-1 grid grid-cols-2 gap-3">
            <CategoryColumn heading="Before" categories={before} />
            <CategoryColumn heading="After" categories={after} />
          </div>
        </div>
      )}
    </div>
  )
}

function CategoryColumn({
  heading,
  categories,
}: {
  heading: string
  categories: ReturnType<typeof parseConfigCategories>
}) {
  return (
    <div>
      <p className="text-[11px] text-text-tertiary">{heading}</p>
      {categories === null || categories.length === 0 ? (
        <p className="text-xs text-text-tertiary">None</p>
      ) : (
        categories.map((category) => (
          <p key={category.name} className="text-xs text-text-primary">
            {configCategoryLabel(category)}
          </p>
        ))
      )}
    </div>
  )
}
