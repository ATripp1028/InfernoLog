import { useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { Menu, Plus } from 'lucide-react'
import { NAV_ITEMS, MOBILE_OVERFLOW_KEYS, type NavItem } from '../utils/navConfig'

export function MobileNav() {
  const [overflowOpen, setOverflowOpen] = useState(false)
  const location = useLocation()

  const byKey = (key: string): NavItem => {
    const item = NAV_ITEMS.find(n => n.key === key)
    if (!item) throw new Error(`Unknown nav key: ${key}`)
    return item
  }
  const list = byKey('list')
  const ranking = byKey('ranking')
  const log = byKey('log')
  const overflow = MOBILE_OVERFLOW_KEYS.map(byKey)

  return (
    <div className="md:hidden">
      {overflowOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOverflowOpen(false)}
            className="fixed inset-0 z-30 bg-black/40"
          />
          <div className="fixed inset-x-0 bottom-[72px] z-40 rounded-t-card border-t border-border-subtle bg-bg-elevated shadow-[0_-8px_24px_rgba(0,0,0,0.5)]">
            <div className="flex justify-center pt-2 pb-1">
              <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
            </div>
            <ul className="flex flex-col gap-1 px-2 py-2">
              {overflow.map(item => (
                <li key={item.key}>
                  <SheetItem item={item} />
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <nav
        aria-label="Primary mobile"
        className="fixed inset-x-0 bottom-0 z-40 flex h-[72px] items-center justify-around border-t border-border-subtle bg-bg-surface px-2"
      >
        <BarTab item={list} active={location.pathname === list.to} />
        <BarTab item={ranking} />
        <FabSlot />
        <BarTab item={log} />
        <MoreTab
          active={overflowOpen}
          onClick={() => setOverflowOpen(v => !v)}
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
  if (item.status === 'available' && item.to) {
    return <Link to={item.to} className={className}>{content}</Link>
  }
  return <div className={className} aria-disabled>{content}</div>
}

function MoreTab({ active, onClick }: { active: boolean; onClick: () => void }) {
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

function FabSlot() {
  return (
    <button
      type="button"
      aria-label="Add level"
      className="flex size-14 items-center justify-center rounded-fab bg-primary text-text-primary shadow-[0_4px_12px_rgba(0,0,0,0.4)] transition-colors hover:bg-primary-hover"
    >
      <Plus size={24} strokeWidth={2.5} />
    </button>
  )
}

function SheetItem({ item }: { item: NavItem }) {
  const Icon = item.icon
  const className =
    'flex h-12 w-full items-center gap-3 rounded-btn px-3 text-text-tertiary opacity-70'
  return (
    <div className={className} aria-disabled>
      <Icon size={20} />
      <span className="text-sm font-medium">{item.label}</span>
    </div>
  )
}
