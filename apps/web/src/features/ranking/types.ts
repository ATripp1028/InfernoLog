import type { ClassicRankingEntry } from '@infernolog/core'

// The level data common to a placed row and an unplaced card — enough to render
// either form, so an item can move between the two containers mid-drag.
export type RankingItem = Pick<
  ClassicRankingEntry,
  'levelProgressId' | 'level' | 'badge' | 'hasPendingUpdate' | 'attempts'
>

export type ContainerId = 'placed' | 'unplaced'
