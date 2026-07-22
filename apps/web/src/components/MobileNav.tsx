import { useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { Menu, Plus } from 'lucide-react'
import {
  NAV_ITEMS,
  MOBILE_OVERFLOW_KEYS,
  type NavItem,
} from '../utils/navConfig'
import { useLoggingFlow } from '@/features/logging/LoggingFlowProvider'
import {
  LOGGING_ACTIONS,
  type LoggingAction,
} from '@/features/logging/loggingActions'
import { useMobileFabContext } from '@/context/MobileFabContext'
import { AddToWantToBeatDialog } from '@/features/collections/AddToWantToBeatDialog'
import { AddToCollectionDialog } from '@/features/collections/AddToCollectionDialog'
import { MobileActionSheet } from '@/components/MobileActionSheet'

// Desktop stacks these bottom-to-top with the primary (completion) as the
// FAB itself, so top-to-bottom reads add-to-list, want-to-beat, drop,
// progress, completion. Mirror that order in the mobile sheet.
const MOBILE_LOGGING_ACTIONS = [...LOGGING_ACTIONS].reverse()

export function MobileNav() {
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [fabMenuOpen, setFabMenuOpen] = useState(false)
  const [wtbOpen, setWtbOpen] = useState(false)
  const [addColOpen, setAddColOpen] = useState(false)
  const location = useLocation()
  const { open } = useLoggingFlow()
  const { overrideToggle } = useMobileFabContext()

  const byKey = (key: string): NavItem => {
    const item = NAV_ITEMS.find((n) => n.key === key)
    if (!item) throw new Error(`Unknown nav key: ${key}`)
    return item
  }
  const list = byKey('list')
  const ranking = byKey('ranking')
  const log = byKey('log')
  const overflow = MOBILE_OVERFLOW_KEYS.map(byKey)

  return (
    <div className="md:hidden">
      <MobileActionSheet
        open={overflowOpen}
        onClose={() => setOverflowOpen(false)}
        ariaLabel="More"
      >
        <ul className="flex flex-col gap-1 px-2 py-2">
          {overflow.map((item) => (
            <li key={item.key}>
              <SheetItem
                item={item}
                onNavigate={() => setOverflowOpen(false)}
              />
            </li>
          ))}
        </ul>
      </MobileActionSheet>

      <MobileActionSheet
        open={fabMenuOpen}
        onClose={() => setFabMenuOpen(false)}
        ariaLabel="Log actions"
      >
        <ul className="flex flex-col gap-1 px-2 py-2">
          {MOBILE_LOGGING_ACTIONS.map((action) => (
            <li key={action.key}>
              <FabSheetItem
                action={action}
                onSelect={() => {
                  setFabMenuOpen(false)
                  if (action.path) {
                    open(action.path)
                  } else if (action.key === 'want-to-beat') {
                    setWtbOpen(true)
                  } else if (action.key === 'add-to-list') {
                    setAddColOpen(true)
                  }
                }}
              />
            </li>
          ))}
        </ul>
      </MobileActionSheet>

      <nav
        aria-label="Primary mobile"
        className="fixed inset-x-0 bottom-0 z-40 flex h-[72px] items-center justify-around border-t border-border-subtle bg-bg-surface px-2"
      >
        <BarTab item={list} active={location.pathname === list.to} />
        <BarTab item={ranking} active={location.pathname === ranking.to} />
        <FabSlot
          active={fabMenuOpen}
          onClick={() => {
            setOverflowOpen(false)
            if (overrideToggle) {
              setFabMenuOpen(false)
              overrideToggle()
            } else {
              setFabMenuOpen((v) => !v)
            }
          }}
        />
        <BarTab item={log} active={location.pathname === log.to} />
        <MoreTab
          active={overflowOpen}
          onClick={() => {
            setFabMenuOpen(false)
            setOverflowOpen((v) => !v)
          }}
        />
      </nav>
      <AddToWantToBeatDialog open={wtbOpen} onClose={() => setWtbOpen(false)} />
      <AddToCollectionDialog
        open={addColOpen}
        onClose={() => setAddColOpen(false)}
      />
    </div>
  )
}

function BarTab({ item, active = false }: { item: NavItem; active?: boolean }) {
  const Icon = item.icon
  const colorClass = active ? 'text-primary' : 'text-text-secondary'
  const content = (
    <>
      <Icon size={22} />
      <span className="text-[11px] font-medium">{item.label}</span>
    </>
  )
  const className = `flex w-16 flex-col items-center justify-center gap-1 ${colorClass}`

  if (active && item.to) {
    return (
      <Link to={item.to} className={className} aria-current="page">
        {content}
      </Link>
    )
  }
  if (item.status === 'enabled' && item.to) {
    return (
      <Link to={item.to} className={className}>
        {content}
      </Link>
    )
  }
  return (
    <div className={className} aria-disabled>
      {content}
    </div>
  )
}

function MoreTab({
  active,
  onClick,
}: {
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      aria-label="More"
      className={`flex w-16 flex-col items-center justify-center gap-1 ${
        active ? 'text-primary' : 'text-text-secondary'
      }`}
    >
      <Menu size={22} />
      <span className="text-[11px] font-medium">More</span>
    </button>
  )
}

function FabSlot({
  active,
  onClick,
}: {
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label="Log a level"
      aria-haspopup="menu"
      aria-expanded={active}
      onClick={onClick}
      className="flex size-14 items-center justify-center rounded-fab bg-primary text-text-primary shadow-[0_4px_12px_rgba(0,0,0,0.4)] transition-colors hover:bg-primary-hover"
    >
      <Plus size={24} strokeWidth={2.5} />
    </button>
  )
}

function FabSheetItem({
  action,
  onSelect,
}: {
  action: LoggingAction
  onSelect: () => void
}) {
  const Icon = action.icon
  if (action.disabled) {
    return (
      <div
        className="flex h-12 w-full items-center gap-3 rounded-btn px-3 text-text-tertiary opacity-70"
        aria-disabled
      >
        <Icon size={20} />
        <span className="text-sm font-medium">{action.label}</span>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex h-12 w-full items-center gap-3 rounded-btn px-3 text-left text-sm font-medium transition-colors ${
        action.highlight
          ? 'bg-primary text-primary-foreground'
          : 'text-text-primary hover:bg-bg-subtle'
      }`}
    >
      <Icon size={20} />
      <span>{action.label}</span>
    </button>
  )
}

function SheetItem({
  item,
  onNavigate,
}: {
  item: NavItem
  onNavigate: () => void
}) {
  const Icon = item.icon
  if (item.status === 'enabled' && item.to) {
    return (
      <Link
        to={item.to}
        onClick={onNavigate}
        className="flex h-12 w-full items-center gap-3 rounded-btn px-3 text-sm font-medium text-text-primary transition-colors hover:bg-bg-subtle"
      >
        <Icon size={20} />
        <span>{item.label}</span>
      </Link>
    )
  }
  return (
    <div
      className="flex h-12 w-full items-center gap-3 rounded-btn px-3 text-text-tertiary opacity-70"
      aria-disabled
    >
      <Icon size={20} />
      <span className="text-sm font-medium">{item.label}</span>
    </div>
  )
}
