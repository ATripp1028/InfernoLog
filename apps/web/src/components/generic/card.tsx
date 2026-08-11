import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Minimal "bordered surface" wrapper used by list rows, settings rows, and
// status callouts. Just the visual surface (border + background + radius);
// layout (flex / padding / gap) is up to the consumer's className. Variants
// switch the border + tint color for semantic emphasis.
const cardVariants = cva('rounded-md border', {
  variants: {
    variant: {
      default: 'border-border-subtle bg-card',
      accent: 'border-accent/40 bg-accent-dim',
      success: 'border-success/40 bg-success-dim',
      danger: 'border-danger/40 bg-danger-dim',
    },
  },
  defaultVariants: { variant: 'default' },
})

/**
 * Card props, including its variant axis.
 */
export interface CardProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

/**
 * A surface panel.
 */
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
