import { Check, Flag, List, Star, X, type LucideIcon } from 'lucide-react'
import type { FlowPath } from './types'

// Shared definition of the logging menu actions, used by both the desktop FAB
// popover (FabMenu) and the mobile bottom-sheet menu (MobileNav). The two
// list-related actions are deferred — shown but disabled — until those
// workflows are built.
export interface LoggingAction {
  key: string
  label: string
  icon: LucideIcon
  path?: FlowPath
  highlight?: boolean
  disabled?: boolean
}

export const LOGGING_ACTIONS: LoggingAction[] = [
  {
    key: 'completion',
    label: 'Log a completion',
    icon: Check,
    path: 'completion',
    highlight: true,
  },
  { key: 'progress', label: 'Log progress', icon: Flag, path: 'progress' },
  { key: 'drop', label: 'Drop a level', icon: X, path: 'drop' },
  { key: 'want-to-beat', label: 'Add to Want to Beat', icon: Star },
  { key: 'add-to-list', label: 'Add to a Collection', icon: List },
]
