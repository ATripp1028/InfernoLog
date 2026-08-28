import { supportedTimeZones } from '@/lib/timezone'
import { FieldHint } from './FieldLabel'

// Computed once — Intl.supportedValuesOf('timeZone') is static per browser session.
const TIME_ZONES = supportedTimeZones()

/**
 * A time input merged into the same visual field as a date input (time on
 * the left), plus an IANA timezone select that only appears once a time is
 * entered — keeps the common no-time case uncluttered. `dateValue`/
 * `timeValue` are native `<input>` value strings (`yyyy-MM-dd`/`HH:mm`, or
 * `''`); `timezoneValue` is only meaningful once `timeValue !== ''`.
 */
export function DateTimeField({
  dateId,
  dateValue,
  timeValue,
  timezoneValue,
  onDateChange,
  onTimeChange,
  onTimezoneChange,
  disabled,
}: {
  dateId?: string
  dateValue: string
  timeValue: string
  timezoneValue: string
  onDateChange: (value: string) => void
  onTimeChange: (value: string) => void
  onTimezoneChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div>
      <div className="flex h-9 w-full overflow-hidden rounded-md border border-input bg-bg-surface shadow-sm transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
        <input
          type="time"
          aria-label="Time (optional)"
          value={timeValue}
          disabled={disabled}
          onChange={(e) => onTimeChange(e.target.value)}
          className="w-[108px] shrink-0 border-0 bg-transparent px-2 py-1 text-sm text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="w-px shrink-0 bg-border" aria-hidden />
        <input
          id={dateId}
          type="date"
          value={dateValue}
          disabled={disabled}
          onChange={(e) => onDateChange(e.target.value)}
          className="min-w-0 flex-1 border-0 bg-transparent px-2 py-1 text-sm text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      {timeValue === '' ? (
        <FieldHint>
          Time is optional — leave blank to just log the date.
        </FieldHint>
      ) : (
        <select
          aria-label="Timezone"
          value={timezoneValue}
          disabled={disabled}
          onChange={(e) => onTimezoneChange(e.target.value)}
          className="mt-2 h-8 w-full rounded-md border border-input bg-bg-surface px-2 text-xs text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {TIME_ZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
