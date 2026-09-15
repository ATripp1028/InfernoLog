import { Check } from 'lucide-react'
import type { PasswordRuleId } from '@infernolog/core'
import { cn } from '@/lib/utils'

interface PasswordRuleChecklistProps {
  /** From core's `passwordRuleResults`, which the API validates with too. */
  rules: { id: PasswordRuleId; description: string; met: boolean }[]
  id?: string
}

/**
 * The password requirements, each ticked off as it is met.
 */
export function PasswordRuleChecklist({
  rules,
  id,
}: PasswordRuleChecklistProps) {
  return (
    <ul
      id={id}
      aria-label="Password requirements"
      className="grid grid-cols-2 gap-x-3 gap-y-1"
    >
      {rules.map((rule) => (
        <li
          key={rule.id}
          className={cn(
            'flex items-center gap-1.5 text-xs',
            rule.met ? 'text-muted-foreground' : 'text-text-tertiary'
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
              rule.met
                ? 'border-success bg-success text-bg-base'
                : 'border-text-tertiary'
            )}
          >
            {rule.met && <Check size={10} strokeWidth={3} />}
          </span>
          {rule.description}
          <span className="sr-only">{rule.met ? '(met)' : '(not met)'}</span>
        </li>
      ))}
    </ul>
  )
}
