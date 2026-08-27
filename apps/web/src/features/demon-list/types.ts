import type { ClassicDemonListEntry } from '@infernolog/core'

/**
 * The level data common to a placed row and an unplaced card — enough to render
 * either form, so an item can move between the two containers mid-drag.
 */
export type DemonListItem = Pick<
  ClassicDemonListEntry,
  'levelProgressId' | 'level' | 'badge' | 'attempts'
>

/**
 * Which side of the ranking board an item is on.
 *
 * Unrelated to the import merge board's `ContainerId`, which names one of
 * three merge columns.
 */
export type ContainerId = 'placed' | 'unplaced'
