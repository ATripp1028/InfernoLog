// The label above a form control, with an optional info affordance. The
// logging flow and the level-page edit modals each had one; the modals' was
// muted and block-level, the flow's carried a hint icon and neither had the
// other's behaviour.

import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/generic/label'

/**
 * A form-control label.
 *
 * @param hint - Rendered as an info icon with this text as its tooltip.
 * Omit rather than passing an empty string; the icon only appears when there
 * is something to say.
 * @param htmlFor - Ties the label to its control. Leave it off for a label
 * over a control group (coins, 2-player) that has no single focusable
 * element — pointing it at an unrelated input steals focus on click, which is
 * what the coin and 2-player sections used to do.
 * @param muted - The edit modals' quieter treatment. Purely visual.
 */
export function FieldLabel({
  children,
  hint,
  htmlFor,
  muted = false,
  className,
}: {
  children: React.ReactNode
  hint?: string
  htmlFor?: string
  muted?: boolean
  className?: string
}) {
  return (
    <div className={cn('mb-1.5 flex items-center gap-1.5', className)}>
      <Label
        htmlFor={htmlFor}
        className={cn(muted && 'font-normal text-text-secondary')}
      >
        {children}
      </Label>
      {hint && (
        <span title={hint} className="text-text-tertiary">
          <Info size={13} />
        </span>
      )}
    </div>
  )
}

/**
 * Muted helper text under a form control. Pairs with {@link FieldLabel} above
 * it — used throughout the logging steps and by {@link DateTimeField}.
 */
export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-text-tertiary">{children}</p>
}
