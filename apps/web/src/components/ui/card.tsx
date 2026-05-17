import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Minimal "bordered surface" wrapper used by list rows, settings rows, and
// status callouts. Just the visual surface (border + background + radius);
// layout (flex / padding / gap) is up to the consumer's className. Variants
// switch the border + tint colour for semantic emphasis.
const cardVariants = cva('rounded-md border', {
  variants: {
    variant: {
      default: 'border-[var(--color-border-subtle)] bg-card',
      accent: 'border-[var(--color-accent)]/40 bg-[var(--color-accent-dim)]',
      success: 'border-[var(--color-success)]/40 bg-[var(--color-success-dim)]',
      danger: 'border-[var(--color-danger)]/40 bg-[var(--color-danger-dim)]',
    },
  },
  defaultVariants: { variant: 'default' },
})

export interface CardProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  )
)
Card.displayName = 'Card'

export { cardVariants }
