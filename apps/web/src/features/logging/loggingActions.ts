import { Check, Flag, List, Star, X, type LucideIcon } from 'lucide-react'
import type { FlowPath } from './types'

// Source data for the default FAB action set (see useDefaultFabActions) —
// shown on pages that don't override the FAB (List, Ranking, etc). The two
// list-related actions are deferred — shown but disabled — until those
// workflows are built.
export interface LoggingAction {
  key: string
  label: string
  icon: LucideIcon
  path?: FlowPath
  disabled?: boolean
}

// completion is first — the FAB treats actions[0] as the primary action.
export const LOGGING_ACTIONS: LoggingAction[] = [
  {
    key: 'completion',
    label: 'Log a completion',
    icon: Check,
    path: 'completion',
  },
  { key: 'progress', label: 'Log progress', icon: Flag, path: 'progress' },
  { key: 'drop', label: 'Drop a level', icon: X, path: 'drop' },
  { key: 'want-to-beat', label: 'Add to Want to Beat', icon: Star },
  { key: 'add-to-list', label: 'Add to a Collection', icon: List },
]
