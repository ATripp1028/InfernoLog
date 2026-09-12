// The demon list — the user's own hardest-first arrangement of their
// completions — is a two-column drag board. Its vocabulary lives here rather
// than in the feature so the board components under components/ordering can
// name it without importing from a feature.

import type { ClassicDemonListEntry } from '@infernolog/core'

/**
 * The level data a row or card renders from.
 *
 * A subset of the demon list's entry rather than its own shape: the board
 * renders placed rows and unplaced cards from the same fields, and the two
 * wire types differ only in the placement data (`rank`, `listIndex`) that
 * only a placed row has.
 */
export type OrderedItem = Pick<
  ClassicDemonListEntry,
  'levelProgressId' | 'level' | 'communityTiers' | 'attempts'
>

/**
 * Which side of an ordering board an item is on.
 *
 * Unrelated to the import merge board's `ContainerId`, which names one of
 * three merge columns.
 */
export type ContainerId = 'placed' | 'unplaced'
