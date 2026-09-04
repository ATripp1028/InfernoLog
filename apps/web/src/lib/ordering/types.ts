// The two hand-arranged orderings — the demon list (hardest first) and the
// MANUAL rating ranking (best first) — are the same board on different axes.
// Their shared vocabulary lives here so neither feature owns it.

import type { ClassicDemonListEntry } from '@infernolog/core'

/**
 * The level data a row or card renders from, in either ordering.
 *
 * Shaped from the demon list's entry because it is the wider of the two: the
 * ranking has no tier badge of its own and passes `badge: null`, which renders
 * nothing rather than a placeholder.
 */
export type OrderedItem = Pick<
  ClassicDemonListEntry,
  'levelProgressId' | 'level' | 'badge' | 'attempts'
>

/**
 * Which side of an ordering board an item is on.
 *
 * Unrelated to the import merge board's `ContainerId`, which names one of
 * three merge columns.
 */
export type ContainerId = 'placed' | 'unplaced'
