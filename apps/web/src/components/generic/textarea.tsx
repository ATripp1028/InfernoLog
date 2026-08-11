import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Native textarea props; the styling is supplied by {@link Textarea}.
 */
export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

/**
 * Multi-line text input matching {@link Input}'s border, background, and
 * focus ring.
 *
 * Five surfaces had inlined their own class string for this, in three
 * mutually-inconsistent focus treatments. Pass `className="resize-none"`
 * where the box should not be draggable.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex w-full rounded-md border border-input bg-bg-surface px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'
