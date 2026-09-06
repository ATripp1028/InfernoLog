import { useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { Menu, Plus, type LucideIcon } from 'lucide-react'
import {
  MOBILE_BAR_KEYS,
  MOBILE_OVERFLOW_KEYS,
  isBarItemActive,
  navItemByKey,
  type NavItem,
} from '@/utils/navConfig'
import {
  useResolvedFabActions,
  type FabAction,
} from '@/context/FabActionsContext'
import { MobileActionSheet } from '@/components/shell/MobileActionSheet'
import { opensSheet, sheetActionOrder } from './fabSheetOrder'
import { cn } from '@/lib/utils'

/**
 * The bottom tab bar shown below the md breakpoint. Overflow tabs live behind the More sheet — see `MOBILE_OVERFLOW_KEYS`.
 */
export function MobileNav() {
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [fabMenuOpen, setFabMenuOpen] = useState(false)
  const location = useLocation()
  const { primary, secondaryActions, sheetHeader } = useResolvedFabActions()

  const orderedActions = sheetActionOrder(primary, secondaryActions)
  // Whether the FAB opens the sheet or fires the primary action outright.
  const showsSheet = opensSheet(secondaryActions)

  const [logKey, rankingKey, searchKey] = MOBILE_BAR_KEYS
  const log = navItemByKey(logKey)
  const ranking = navItemByKey(rankingKey)
  const search = navItemByKey(searchKey)
  const overflow = MOBILE_OVERFLOW_KEYS.map(navItemByKey)

  const isActive = (item: NavItem) => isBarItemActive(item, location.pathname)

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
        ariaLabel={sheetHeader ?? 'Quick actions'}
      >
        {sheetHeader && (
          <p className="px-5 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
            {sheetHeader}
          </p>
        )}
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
        <BarTab item={log} active={isActive(log)} />
        <BarTab item={ranking} active={isActive(ranking)} />
        <FabSlot
          active={fabMenuOpen}
          label={primary.label}
          icon={Plus}
          // Only when the tap fires the primary outright. With a sheet the
          // button opens a list, and a disabled primary is rendered inert as a
          // row inside it (FabSheetItem) — disabling the button there would
          // hide every other action along with it, which is also what makes
          // the 'pending' action set (every action disabled) still tappable
          // enough to show why nothing can be chosen yet.
          disabled={!showsSheet && primary.disabled === true}
          onClick={() => {
            setOverflowOpen(false)
            if (showsSheet) {
              setFabMenuOpen((v) => !v)
            } else {
              primary.onClick()
            }
          }}
        />
        <BarTab item={search} active={isActive(search)} />
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
  disabled = false,
  onClick,
}: {
  active: boolean
  label: string
  icon: LucideIcon
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex size-14 items-center justify-center rounded-fab bg-primary text-text-primary shadow-[0_4px_12px_rgba(0,0,0,0.4)] transition-colors',
        // Same treatment the desktop speed dial gives a disabled action.
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-primary-hover'
      )}
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
          ? 'text-danger hover:bg-danger-dim'
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
