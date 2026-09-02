// The demon list's board vocabulary now lives in lib/ordering, shared with the
// MANUAL rating ranking — the same board on a different axis. Re-exported here
// so the feature's own files read naturally.

export type { ContainerId, OrderedItem as DemonListItem } from '@/lib/ordering/types'
