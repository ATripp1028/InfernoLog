// The small uppercase heading that titles a group of fields, rows, or cards.
// Five features had grown their own copy, each with a slightly different size,
// tracking, weight, and colour for what is visually one element; the variants
// below are the two sizes and three tones those five collapsed into.

import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const sectionLabelVariants = cva('uppercase', {
  variants: {
    size: {
      default: 'text-xs font-semibold tracking-wide',
      xs: 'text-[10px] font-medium tracking-wide',
    },
    tone: {
      secondary: 'text-text-secondary',
      tertiary: 'text-text-tertiary',
      accent: 'text-accent-hover',
      primary: 'text-primary',
    },
  },
  defaultVariants: { size: 'default', tone: 'tertiary' },
})

/**
 * A section heading — "STATS", "FLAGS", "YOUR COLLECTIONS".
 *
 * Carries no margin of its own; callers that need one pass it in
 * `className`, since the spacing below a heading belongs to the layout around
 * it rather than to the heading.
 *
 * @param tone - `accent` marks a section that is doing something unusual (the
 * search page's escalated RobTop results); `primary` marks the one the user is
 * being asked to act on. Neither is merely emphasis.
 */
export function SectionLabel({
  children,
  size,
  tone,
  className,
}: {
  children: React.ReactNode
  className?: string
} & VariantProps<typeof sectionLabelVariants>) {
  return (
    <p className={cn(sectionLabelVariants({ size, tone }), className)}>
      {children}
    </p>
  )
}
