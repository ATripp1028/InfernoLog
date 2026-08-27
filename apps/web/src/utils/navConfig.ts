import {
  LayoutList,
  Library,
  Trophy,
  ScrollText,
  History,
  BarChart3,
  Triangle,
  ShieldCheck,
  Search,
  type LucideIcon,
} from 'lucide-react'

type NavStatus = 'enabled' | 'disabled'

/**
 * One navigation destination. A `disabled` item renders greyed out rather than being hidden, so planned tabs stay visible.
 */
export interface NavItem {
  key: string
  label: string
  // Shown by the mobile tab bar instead of `label` when set. The bar gives each
  // tab 64px at 11px type, which a two-word label overflows into a second line
  // and out of the bar's fixed height. The rail and the More sheet always use
  // `label` — they have the room.
  shortLabel?: string
  icon: LucideIcon
  to?: string
  status: NavStatus
  // Extra path prefixes that should also mark this item active. The Search tab
  // uses this so the Global Level Page (/levels/*) — part of the Search tab but
  // on its own route — highlights Search.
  activePrefixes?: string[]
}

/**
 * Every navigation destination, in display order. Shared by the sidebar and the mobile tab bar.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    key: 'search',
    label: 'Search',
    icon: Search,
    to: '/search',
    status: 'enabled',
    activePrefixes: ['/levels'],
  },
  {
    key: 'log',
    label: 'Log',
    icon: LayoutList,
    to: '/log',
    status: 'enabled',
  },
  {
    key: 'demon-list',
    label: 'Demon List',
    shortLabel: 'Demons',
    icon: Trophy,
    to: '/demon-list',
    status: 'enabled',
  },
  {
    key: 'collections',
    label: 'Collections',
    icon: Library,
    to: '/collections',
    status: 'enabled',
  },
  {
    key: 'events',
    label: 'Events',
    icon: ScrollText,
    to: '/events',
    status: 'enabled',
  },
  { key: 'time', label: 'Time Machine', icon: History, status: 'disabled' },
  { key: 'stats', label: 'Stats', icon: BarChart3, status: 'disabled' },
  { key: 'picker', label: 'Level Picker', icon: Triangle, status: 'disabled' },
  {
    key: 'moderation',
    label: 'Moderation',
    icon: ShieldCheck,
    status: 'disabled',
  },
]

/**
 * The {@link NAV_ITEMS} keys with their own tab in the mobile bottom bar, in
 * display order. The bar has room for exactly these three plus the FAB and the
 * More button; everything else must appear in {@link MOBILE_OVERFLOW_KEYS} or
 * it is unreachable on mobile.
 */
export const MOBILE_BAR_KEYS = ['log', 'demon-list', 'search'] as const

/**
 * The {@link NAV_ITEMS} keys that move behind the mobile "More" sheet instead of getting their own tab.
 */
export const MOBILE_OVERFLOW_KEYS = [
  'collections',
  'events',
  'time',
  'stats',
  'picker',
  'moderation',
] as const

/**
 * The {@link NAV_ITEMS} entry with this key.
 *
 * @throws If no item has the key — the nav is a fixed table, so a miss is a
 * typo in the caller rather than a runtime condition to handle.
 */
export function navItemByKey(key: string): NavItem {
  const item = NAV_ITEMS.find((n) => n.key === key)
  if (!item) throw new Error(`Unknown nav key: ${key}`)
  return item
}

/**
 * Whether the desktop rail should highlight `item` for this path.
 *
 * The rail stays lit while the user is drilled into a sub-page (a collection's
 * detail, a level's log), so `/log/abc` keeps Log highlighted.
 */
export function isRailItemActive(item: NavItem, pathname: string): boolean {
  if (!item.to) return false
  return (
    pathname === item.to ||
    pathname.startsWith(`${item.to}/`) ||
    matchesActivePrefix(item, pathname)
  )
}

/**
 * Whether the mobile tab bar should highlight `item` for this path.
 *
 * Deliberately stricter than {@link isRailItemActive}: the bottom bar shows no
 * active tab at all once drilled into a detail sub-page, because that page's
 * own back affordance — not a lit tab — is what tells the user where they are.
 * `activePrefixes` still counts, so the Global Level Page lights up Search.
 */
export function isBarItemActive(item: NavItem, pathname: string): boolean {
  return pathname === item.to || matchesActivePrefix(item, pathname)
}

function matchesActivePrefix(item: NavItem, pathname: string): boolean {
  return item.activePrefixes?.some((p) => pathname.startsWith(p)) ?? false
}
