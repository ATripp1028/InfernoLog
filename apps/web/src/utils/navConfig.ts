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

export interface NavItem {
  key: string
  label: string
  icon: LucideIcon
  to?: string
  status: NavStatus
  // Extra path prefixes that should also mark this item active. The Search tab
  // uses this so the Global Level Page (/levels/*) — part of the Search tab but
  // on its own route — highlights Search.
  activePrefixes?: string[]
}

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
    key: 'list',
    label: 'List',
    icon: LayoutList,
    to: '/list',
    status: 'enabled',
  },
  {
    key: 'ranking',
    label: 'Ranking',
    icon: Trophy,
    to: '/ranking',
    status: 'enabled',
  },
  {
    key: 'collections',
    label: 'Collections',
    icon: Library,
    to: '/collections',
    status: 'enabled',
  },
  { key: 'log', label: 'Log', icon: ScrollText, status: 'disabled' },
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

export const MOBILE_OVERFLOW_KEYS = [
  'search',
  'collections',
  'time',
  'stats',
  'picker',
  'moderation',
] as const
