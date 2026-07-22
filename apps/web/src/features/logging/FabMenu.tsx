import { useRef, useState } from 'react'
import { useLocation } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLoggingFlow } from './LoggingFlowProvider'
import { LOGGING_ACTIONS, type LoggingAction } from './loggingActions'
import type { FlowPath } from './types'
import { AddToWantToBeatDialog } from '@/features/collections/AddToWantToBeatDialog'
import { AddToCollectionDialog } from '@/features/collections/AddToCollectionDialog'

// How long the group stays expanded after the pointer leaves it. Gives the
// cursor room to cross gaps between buttons (or overshoot briefly) without
// the stack collapsing back into the FAB.
const CLOSE_DELAY_MS = 350

const PRIMARY_ACTION = LOGGING_ACTIONS.find((a) => a.highlight)!
// Rendered nearest-to-FAB first, so the stack fans out upward in this order.
const SECONDARY_ACTIONS = [...LOGGING_ACTIONS]
  .filter((a) => a !== PRIMARY_ACTION)
  .reverse()

// Desktop FAB: a hover-activated speed dial. Hovering the group fans the
// secondary actions out above the FAB; hovering any single button expands it
// into an icon+label pill.
export function FabMenu() {
  const { open } = useLoggingFlow()
  const [expanded, setExpanded] = useState(false)
  const [wtbOpen, setWtbOpen] = useState(false)
  const [addColOpen, setAddColOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  // The collections pages render their own context-scoped FAB.
  const suppressed = location.pathname.startsWith('/collections')

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

  function start(path: FlowPath) {
    setExpanded(false)
    open(path)
  }

  function getOnClick(action: LoggingAction): () => void {
    if (action.path) return () => start(action.path!)
    if (action.key === 'want-to-beat')
      return () => {
        setExpanded(false)
        setWtbOpen(true)
      }
    if (action.key === 'add-to-list')
      return () => {
        setExpanded(false)
        setAddColOpen(true)
      }
    return () => {}
  }

  return (
    <>
      {!suppressed && (
        <div
          ref={containerRef}
          role="group"
          aria-label="Log actions"
          className="fixed bottom-6 z-20 hidden flex-col items-end gap-3 transition-[right] duration-200 md:flex"
          style={{ right: 'calc(1.5rem + var(--fab-shift, 0px))' }}
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
              SECONDARY_ACTIONS.map((action, i) => (
                <motion.div
                  key={action.key}
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 16, scale: 0.85 }}
                  transition={{ duration: 0.18, ease: 'easeOut', delay: i * 0.03 }}
                >
                  <FabActionButton
                    icon={action.icon}
                    label={action.label}
                    disabled={action.disabled ?? false}
                    onClick={getOnClick(action)}
                  />
                </motion.div>
              ))}
          </AnimatePresence>

          <FabActionButton
            primary
            icon={Plus}
            hoverIcon={PRIMARY_ACTION.icon}
            label={PRIMARY_ACTION.label}
            ariaLabel="Add level"
            onClick={getOnClick(PRIMARY_ACTION)}
          />
        </div>
      )}
      <AddToWantToBeatDialog open={wtbOpen} onClose={() => setWtbOpen(false)} />
      <AddToCollectionDialog
        open={addColOpen}
        onClose={() => setAddColOpen(false)}
      />
    </>
  )
}

function FabActionButton({
  icon: Icon,
  hoverIcon: HoverIcon,
  label,
  ariaLabel,
  onClick,
  disabled,
  primary,
}: {
  icon: LucideIcon
  hoverIcon?: LucideIcon
  label: string
  ariaLabel?: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const ShownIcon = hovered && HoverIcon ? HoverIcon : Icon

  return (
    <motion.button
      type="button"
      layout
      aria-label={ariaLabel ?? label}
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
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <motion.span
        layout="position"
        className="relative flex shrink-0 items-center justify-center"
      >
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={hovered && HoverIcon ? 'hover-icon' : 'icon'}
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
