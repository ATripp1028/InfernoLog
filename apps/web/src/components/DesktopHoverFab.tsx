import { useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// How long the group stays expanded after the pointer leaves it. Gives the
// cursor room to cross gaps between buttons (or overshoot briefly) without
// the stack collapsing back into the FAB.
const CLOSE_DELAY_MS = 350

export interface HoverFabAction {
  key: string
  label: string
  icon: LucideIcon
  onClick: () => void
  disabled?: boolean | undefined
  danger?: boolean | undefined
}

interface DesktopHoverFabProps {
  primary: HoverFabAction
  // Icon shown before the FAB is hovered; crossfades to primary.icon on
  // hover. Omit when primary.icon already fits the action (e.g. Plus for an
  // "add" action) and no crossfade is needed.
  restIcon?: LucideIcon | undefined
  // Rendered above the FAB. List farthest-from-FAB first — put the most
  // consequential/least-common action first so it lands furthest away.
  secondaryActions?: HoverFabAction[]
  groupAriaLabel: string
  className?: string
  style?: CSSProperties
}

// A hover-activated speed dial: hovering the group fans secondary actions
// out above the FAB; hovering any single button expands it into an
// icon+label pill.
export function DesktopHoverFab({
  primary,
  restIcon,
  secondaryActions = [],
  groupAriaLabel,
  className,
  style,
}: DesktopHoverFabProps) {
  const [expanded, setExpanded] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )
  const containerRef = useRef<HTMLDivElement>(null)

  function cancelClose() {
    clearTimeout(closeTimer.current)
  }

  function openGroup() {
    cancelClose()
    setExpanded(true)
  }

  function scheduleClose() {
    cancelClose()
    closeTimer.current = setTimeout(() => setExpanded(false), CLOSE_DELAY_MS)
  }

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={groupAriaLabel}
      className={cn('hidden flex-col items-end gap-3 md:flex', className)}
      style={style}
      onMouseEnter={openGroup}
      onMouseLeave={scheduleClose}
      onFocus={openGroup}
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node))
          scheduleClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setExpanded(false)
      }}
    >
      <AnimatePresence>
        {expanded &&
          secondaryActions.map((action, i) => (
            <motion.div
              key={action.key}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.85 }}
              transition={{ duration: 0.18, ease: 'easeOut', delay: i * 0.03 }}
            >
              <FabActionButton action={action} />
            </motion.div>
          ))}
      </AnimatePresence>

      <FabActionButton action={primary} restIcon={restIcon} primary />
    </div>
  )
}

function FabActionButton({
  action: { icon: Icon, label, onClick, disabled, danger },
  restIcon: RestIcon,
  primary,
}: {
  action: HoverFabAction
  restIcon?: LucideIcon | undefined
  primary?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const ShownIcon = hovered || !RestIcon ? Icon : RestIcon

  return (
    <motion.button
      type="button"
      layout
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      transition={{ layout: { duration: 0.18, ease: 'easeOut' } }}
      className={cn(
        'flex items-center justify-center gap-2 overflow-hidden rounded-fab px-3.5 shadow-[0_4px_12px_rgba(0,0,0,0.4)] transition-colors',
        primary
          ? 'h-14 min-w-14 bg-primary text-text-primary hover:bg-primary-hover'
          : 'h-11 min-w-11 bg-bg-elevated text-text-primary hover:bg-bg-subtle',
        !disabled &&
          danger &&
          'text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)]',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <motion.span
        layout="position"
        className="relative flex shrink-0 items-center justify-center"
      >
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={hovered || !RestIcon ? 'icon' : 'rest-icon'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="flex items-center justify-center"
          >
            <ShownIcon size={primary ? 24 : 18} strokeWidth={primary ? 2.5 : 2} />
          </motion.span>
        </AnimatePresence>
      </motion.span>
      <AnimatePresence initial={false}>
        {hovered && (
          <motion.span
            key="label"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.16 }}
            className="overflow-hidden whitespace-nowrap text-sm"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}
