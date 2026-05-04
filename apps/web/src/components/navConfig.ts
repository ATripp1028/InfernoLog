import {
  LayoutList,
  Trophy,
  ScrollText,
  History,
  BarChart3,
  Triangle,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

export type NavStatus = 'active' | 'available' | 'disabled'

export interface NavItem {
  key: string
  label: string
  icon: LucideIcon
  to?: '/list'
  status: NavStatus
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'list', label: 'List', icon: LayoutList, to: '/list', status: 'active' },
  { key: 'ranking', label: 'Ranking', icon: Trophy, status: 'available' },
  { key: 'log', label: 'Log', icon: ScrollText, status: 'available' },
  { key: 'time', label: 'Time Machine', icon: History, status: 'disabled' },
  { key: 'stats', label: 'Stats', icon: BarChart3, status: 'disabled' },
  { key: 'picker', label: 'Level Picker', icon: Triangle, status: 'disabled' },
  { key: 'moderation', label: 'Moderation', icon: ShieldCheck, status: 'disabled' },
]

export const MOBILE_OVERFLOW_KEYS = ['time', 'stats', 'picker', 'moderation'] as const
