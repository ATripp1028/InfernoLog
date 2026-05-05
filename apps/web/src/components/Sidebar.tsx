import { Link, useLocation } from '@tanstack/react-router'
import { NAV_ITEMS, type NavItem } from '../utils/navConfig'

export function Sidebar() {
  const location = useLocation()

  return (
    <nav
      aria-label="Primary"
      className="hidden shrink-0 flex-col gap-1 border-r border-border-subtle bg-bg-surface py-4 md:flex md:w-16 md:px-2 xl:w-60 xl:px-3"
    >
      {NAV_ITEMS.map(item => (
        <SidebarItem
          key={item.key}
          item={item}
          active={item.to ? location.pathname === item.to : false}
        />
      ))}
    </nav>
  )
}

interface SidebarItemProps {
  item: NavItem
  active: boolean
}

function SidebarItem({ item, active }: SidebarItemProps) {
  const Icon = item.icon

  // Match Figma: active = primary tint + indicator + primary fg;
  // available = secondary fg + hover; disabled = dimmed, no hover.
  const stateClasses = active
    ? 'bg-primary-dim text-primary'
    : item.status === 'enabled'
      ? 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
      : 'text-text-tertiary opacity-70 cursor-not-allowed'

  const content = (
    <>
      <span
        aria-hidden
        className={`absolute left-0 h-5 w-[3px] rounded-sm bg-primary transition-opacity ${active ? 'opacity-100' : 'opacity-0'
          }`}
      />
      <Icon size={18} className="shrink-0" />
      <span className="hidden text-sm font-medium xl:inline">{item.label}</span>
    </>
  )

  // Common shape: pill-shaped row, icon centered on tablet, icon+label on desktop.
  const baseClasses =
    'relative flex h-10 items-center gap-3 rounded-btn px-3 transition-colors md:justify-center xl:justify-start'

  if (active && item.to) {
    return (
      <Link to={item.to} className={`${baseClasses} ${stateClasses}`} aria-current="page">
        {content}
      </Link>
    )
  }

  if (item.status === 'enabled' && item.to) {
    return (
      <Link to={item.to} className={`${baseClasses} ${stateClasses}`}>
        {content}
      </Link>
    )
  }

  return (
    <div
      className={`${baseClasses} ${stateClasses}`}
      aria-disabled={item.status === 'disabled'}
      title={item.status === 'disabled' ? 'Coming soon' : undefined}
    >
      {content}
    </div>
  )
}
