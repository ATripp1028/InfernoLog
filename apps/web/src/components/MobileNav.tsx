import { useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { Menu, type LucideIcon } from 'lucide-react'
import {
  NAV_ITEMS,
  MOBILE_OVERFLOW_KEYS,
  type NavItem,
} from '../utils/navConfig'
import {
  useResolvedFabActions,
  type FabAction,
} from '@/context/FabActionsContext'
import { MobileActionSheet } from '@/components/MobileActionSheet'
import { cn } from '@/lib/utils'

export function MobileNav() {
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [fabMenuOpen, setFabMenuOpen] = useState(false)
  const location = useLocation()
  const { primary, secondaryActions } = useResolvedFabActions()

  // Bottom-to-top on desktop reads primary last; the mobile list mirrors
  // that top-to-bottom, so the primary row goes last here too.
  const orderedActions = secondaryActions.concat(primary)

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
        ariaLabel="Quick actions"
      >
        <ul className="flex flex-col gap-1 px-2 py-2">
          {orderedActions.map((action) => (
            <li key={action.key}>
              <FabSheetItem
                action={action}
                onSelect={() => {
                  setFabMenuOpen(false)
                  action.onClick()
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
          label={primary.label}
          icon={primary.icon}
          onClick={() => {
            setOverflowOpen(false)
            setFabMenuOpen((v) => !v)
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
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean
  label: string
  icon: LucideIcon
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={active}
      onClick={onClick}
      className="flex size-14 items-center justify-center rounded-fab bg-primary text-text-primary shadow-[0_4px_12px_rgba(0,0,0,0.4)] transition-colors hover:bg-primary-hover"
    >
      <Icon size={24} strokeWidth={2.5} />
    </button>
  )
}

function FabSheetItem({
  action,
  onSelect,
}: {
  action: FabAction
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
      className={cn(
        'flex h-12 w-full items-center gap-3 rounded-btn px-3 text-left text-sm font-medium transition-colors',
        action.danger
          ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)]'
          : 'text-text-primary hover:bg-bg-subtle'
      )}
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
