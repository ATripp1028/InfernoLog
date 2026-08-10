// Form chrome shared between EditRunModal (ProgressUpdate-scoped fields) and
// EditLevelModal (LevelProgress-scoped fields), so neither modal duplicates
// the other's. Controls that the LOGGING flow also renders live in
// src/components/ instead — see CoinPicker and TwoPlayerPicker, re-exported
// here only so the modals keep one import.
import { SectionLabel } from '@/components/SectionLabel'
import { RatingRow as SharedRatingRow } from '@/components/RatingRow'
import { FieldLabel as SharedFieldLabel } from '@/components/FieldLabel'

/** The edit modals' label — {@link SharedFieldLabel} in its muted treatment. */
export function FieldLabel(
  props: Omit<React.ComponentProps<typeof SharedFieldLabel>, 'muted'>
) {
  return <SharedFieldLabel {...props} muted />
}

export { Textarea } from '@/components/ui/textarea'
export { CoinPicker } from '@/components/CoinPicker'
export { TwoPlayerPicker } from '@/components/TwoPlayerPicker'

/** A titled group of fields within an edit modal. */
export function Section({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  )
}

/**
 * The edit modals' rating row: a finer slider step than the logging flow's,
 * and a narrower label column. Values are in display units, as
 * {@link SharedRatingRow} requires — the modals' form state already holds
 * them that way.
 */
export function RatingRow(
  props: Omit<
    React.ComponentProps<typeof SharedRatingRow>,
    'sliderStep' | 'labelWidth'
  >
) {
  return (
    <SharedRatingRow
      {...props}
      sliderStep={props.scale === 'ZERO_TO_TEN' ? 0.1 : 1}
      labelWidth="sm:w-24"
    />
  )
}
