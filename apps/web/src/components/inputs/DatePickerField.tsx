// One end of a date range: a text box that accepts the user's own date format,
// a calendar button that opens the native picker, and a clear button.
//
// Shared by the List's date-beaten bounds and the Log page's recorded-time
// range. It was the List's private control until the second caller appeared —
// see docs/CODE_QUALITY.md, Frontend §3.

import { Calendar, X } from 'lucide-react'
import { formatDate } from '@/lib/dateFormat'
import { cn } from '@/lib/utils'
import type { DateFormatPreference } from '@/lib/api/wireEnums'
import { toIso, useDateField } from './useDateField'

const inputCls =
  'w-full rounded border border-border bg-bg-elevated px-1.5 py-0.5 text-[11px] text-center text-text-primary outline-none focus:border-primary transition-colors'

/**
 * A date bound the user can type or pick.
 *
 * @param value - Epoch ms, or null for an open bound. An open upper bound is
 * left open rather than defaulting to today, so "no end date" never silently
 * becomes "up to now".
 * @param placeholder - What an open bound reads as ("Any", "Today").
 */
export function DatePickerField({
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
  const { draft, setDraft, commit, commitIso, clear, calRef, openCalendar } =
    useDateField({ onChange, datePref, min, max })

  return (
    <div className="flex flex-1 flex-col gap-0.5">
      <p className="text-[10px] text-text-tertiary">{label}</p>
      <div className="relative flex items-center">
        <input
          className={cn(inputCls, 'pr-9')}
          value={
            draft ??
            (value != null ? formatDate(new Date(value), datePref) : '')
          }
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
          onClick={openCalendar}
          aria-label="Open calendar"
        >
          <Calendar size={11} />
        </button>
        {value != null && (
          <button
            type="button"
            className="absolute right-1 cursor-pointer text-text-tertiary transition-colors hover:text-text-primary"
            onClick={clear}
            aria-label={`Clear ${label}`}
          >
            <X size={10} />
          </button>
        )}
        {/* The native picker, driven by the calendar button above. Kept
            offscreen rather than styled, because a date input's own chrome
            cannot be restyled to match the rest of the app. */}
        <input
          ref={calRef}
          type="date"
          tabIndex={-1}
          className="pointer-events-none absolute h-px w-px opacity-0"
          value={value != null ? toIso(value) : ''}
          {...(min != null && { min: toIso(min) })}
          {...(max != null && { max: toIso(max) })}
          onChange={(e) => commitIso(e.target.value)}
        />
      </div>
    </div>
  )
}
