import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Native input props; the styling is supplied by {@link Input}.
 */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

/**
 * The app's text input. `className` wins over the defaults via `cn`.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-bg-surface px-3 py-1 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'
