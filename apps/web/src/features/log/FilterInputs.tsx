// The From/To date pair FilterPanel's date filter is built from. The date box
// itself is shared with the Log page's range and lives in
// components/inputs/DatePickerField; the range slider moved to
// components/inputs/RangeRow when the /search filters needed it too.

import { DatePickerField } from '@/components/inputs/DatePickerField'
import type { DateFormatPreference } from '@/lib/api/wireEnums'
import type { DateBounds } from './types'

/**
 * The date-beaten bounds. Either end may be left open, so an unset upper bound never silently means 'today'.
 */
export function DatePickersRow({
  value,
  onChange,
  datePref,
  minDate,
  today,
}: {
  value: DateBounds
  onChange: (v: DateBounds) => void
  datePref: DateFormatPreference
  minDate: number
  // "Now" for the upper bound, passed in so the panel and its inputs agree.
  today: number
}) {
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
