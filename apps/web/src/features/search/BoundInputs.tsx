import { cn } from '@/lib/utils'
import type { BoundFilterConfig } from './rangeFilters'
import { useBoundInputs, type Bounds } from './useBoundInputs'

// One labelled box. The field's name rides along in a screen-reader-only span,
// so "At least" is announced as "Downloads, at least" rather than bare.
function BoundField({
  id,
  fieldLabel,
  label,
  prefix,
  placeholder,
  inputMode,
  value,
  invalid,
  describedBy,
  onEdit,
  onCommit,
  onRevert,
}: {
  id: string
  fieldLabel: string
  label: string
  prefix: string | undefined
  placeholder: string
  inputMode: 'numeric' | 'text'
  value: string
  invalid: boolean
  describedBy: string
  onEdit: (text: string) => void
  onCommit: () => void
  onRevert: () => void
}) {
  return (
    <div className="min-w-0 flex-1">
      <label
        htmlFor={id}
        className="mb-1 block text-[11px] text-text-secondary"
      >
        <span className="sr-only">{fieldLabel}, </span>
        {label}
      </label>
      <div
        className={cn(
          'flex h-9 items-center gap-1 rounded-md border bg-bg-elevated px-2.5 transition-colors focus-within:border-primary',
          invalid ? 'border-danger' : 'border-border'
        )}
      >
        {prefix && (
          <span aria-hidden className="text-sm text-text-tertiary">
            {prefix}
          </span>
        )}
        <input
          id={id}
          inputMode={inputMode}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onChange={(e) => onEdit(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommit()
            if (e.key === 'Escape') onRevert()
          }}
          className="w-full min-w-0 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
        />
      </div>
    </div>
  )
}

/**
 * An unbounded range filter as two labelled boxes. Empty is no limit, and the
 * line beneath explains the filter until a value is set, then restates what it
 * matches ("The top 100", "At least 10,000 downloads").
 */
export function BoundInputs({
  cfg,
  value,
  onChange,
}: {
  cfg: BoundFilterConfig
  value: Bounds
  onChange: (next: Bounds) => void
}) {
  const { ids, text, edit, commit, revert, invalid, tone, message } =
    useBoundInputs({
      value,
      onChange,
      parse: cfg.parse,
      format: cfg.format,
      describe: cfg.describe,
      hint: cfg.hint,
      invalidMessage: cfg.invalidMessage,
    })

  return (
    <div>
      <div className="flex items-end gap-2">
        <BoundField
          id={ids.min}
          fieldLabel={cfg.label}
          label={cfg.minLabel}
          prefix={cfg.prefix}
          placeholder={cfg.minPlaceholder}
          inputMode={cfg.inputMode}
          value={text('min')}
          invalid={invalid === 'min'}
          describedBy={ids.message}
          onEdit={(t) => edit('min', t)}
          onCommit={() => commit('min')}
          onRevert={() => revert('min')}
        />
        <span aria-hidden className="pb-2 text-text-tertiary">
          –
        </span>
        <BoundField
          id={ids.max}
          fieldLabel={cfg.label}
          label={cfg.maxLabel}
          prefix={cfg.prefix}
          placeholder={cfg.maxPlaceholder}
          inputMode={cfg.inputMode}
          value={text('max')}
          invalid={invalid === 'max'}
          describedBy={ids.message}
          onEdit={(t) => edit('max', t)}
          onCommit={() => commit('max')}
          onRevert={() => revert('max')}
        />
      </div>
      <p
        id={ids.message}
        aria-live="polite"
        className={cn(
          'mt-1.5 text-[11px] leading-snug',
          tone === 'error'
            ? 'text-danger-soft'
            : tone === 'summary'
              ? 'text-text-secondary'
              : 'text-text-tertiary'
        )}
      >
        {message}
      </p>
    </div>
  )
}
