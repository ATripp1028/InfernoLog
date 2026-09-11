// Which figures a /search result row adds beyond its standing stats, and what
// each one reads. A row always shows downloads, likes and length; on top of
// that it shows whatever the user is sorting or filtering by, so the order and
// the filter can be read off the results themselves. Pure — SearchGridRow
// renders what this returns.

import {
  LEVEL_RANGE_FIELDS,
  SONG_TYPE_OPTIONS,
  rangeMaxKey,
  rangeMinKey,
  type LevelBrowseResult,
  type LevelRangeField,
  type LevelSort,
  type SearchPageState,
} from '@/lib/levelSearchParams'
import {
  formatCommunityEnjoyment,
  formatDuration,
} from '@/lib/levelStatFormat'
import { formatNumber } from '@/lib/numberFormat'
import {
  TIER_LIST_ICONS,
  aredlLook,
  gddlTierLook,
  sheetTierLook,
  type TierBadgeLook,
} from '@/lib/tierBadges'

/** A figure a row can surface for the current sort or filters. */
export type RowStatKey =
  | 'gddlTier'
  | 'aredlRank'
  | 'sheetTier'
  | 'enjoyment'
  | 'duration'
  | 'objectCount'
  | 'gameVersion'
  | 'ratedAt'
  | 'coins'
  | 'twoPlayer'
  | 'song'

// Sorts and range filters whose figure the row doesn't already carry. The
// rest are covered: downloads, likes and length are standing stats, and the
// difficulty face shows the difficulty sort and the difficulty / rate-status
// filters.
const SORT_STAT: Partial<Record<LevelSort, RowStatKey>> = {
  gddlTier: 'gddlTier',
  aredlRank: 'aredlRank',
  sheetTier: 'sheetTier',
  enjoyment: 'enjoyment',
  duration: 'duration',
  objectCount: 'objectCount',
  gameVersion: 'gameVersion',
  recentlyRated: 'ratedAt',
}
const RANGE_STAT: Partial<Record<LevelRangeField, RowStatKey>> = {
  gddlTier: 'gddlTier',
  aredlRank: 'aredlRank',
  enjoyment: 'enjoyment',
  duration: 'duration',
  objectCount: 'objectCount',
  gameVersion: 'gameVersion',
}

/**
 * The figures rows should add for this search: the sort's first, then each
 * filter's, each at most once.
 */
export function rowStatKeys(state: SearchPageState): RowStatKey[] {
  const keys: RowStatKey[] = []
  const add = (key: RowStatKey | undefined) => {
    if (key && !keys.includes(key)) keys.push(key)
  }
  add(SORT_STAT[state.sort])
  for (const f of LEVEL_RANGE_FIELDS) {
    if (
      state[rangeMinKey(f)] !== undefined ||
      state[rangeMaxKey(f)] !== undefined
    ) {
      add(RANGE_STAT[f])
    }
  }
  if (state.sheetTier !== undefined) add('sheetTier')
  if (state.coinCount?.length || state.coinsVerified !== undefined) {
    add('coins')
  }
  if (state.twoPlayer !== undefined) add('twoPlayer')
  if (state.songType) add('song')
  return keys
}

/**
 * One figure, ready to render: a community-list placement as a painted badge
 * beside its list's icon, or a labelled value. A null value is unknown, and
 * renders as a dash rather than being left out — under a sort by it, the
 * blank is the reason the row sits where it does.
 */
export type RowStat =
  | {
      key: RowStatKey
      kind: 'tier'
      label: string
      icon: string
      look: TierBadgeLook
      source: 'NLW' | 'LW' | null
    }
  | { key: RowStatKey; kind: 'text'; label: string; value: string | null }

const RATED_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

function text(key: RowStatKey, label: string, value: string | null): RowStat {
  return { key, kind: 'text', label, value }
}

function coinsValue(level: LevelBrowseResult): string | null {
  if (level.coins == null) return null
  const count = `${level.coins} ${level.coins === 1 ? 'coin' : 'coins'}`
  if (level.coins === 0 || level.coinsVerified == null) return count
  return `${count}, ${level.coinsVerified ? 'verified' : 'unverified'}`
}

/**
 * The figure `key` names, read off one result row.
 */
export function rowStat(level: LevelBrowseResult, key: RowStatKey): RowStat {
  switch (key) {
    case 'gddlTier':
      return level.gddlTier == null
        ? text(key, 'GDDL', null)
        : {
            key,
            kind: 'tier',
            label: 'GDDL tier',
            icon: TIER_LIST_ICONS.gddl,
            look: gddlTierLook(level.gddlTier),
            source: null,
          }
    case 'aredlRank': {
      const look = aredlLook(level.aredlRank, level.aredlStatus)
      return look
        ? {
            key,
            kind: 'tier',
            label: look.ranked ? 'AREDL rank' : 'AREDL status',
            icon: TIER_LIST_ICONS.aredl,
            look,
            source: null,
          }
        : text(key, 'AREDL', null)
    }
    case 'sheetTier': {
      const look = sheetTierLook(level.sheetTier)
      return look
        ? {
            key,
            kind: 'tier',
            label: 'Sheet tier',
            icon: TIER_LIST_ICONS.sheet,
            look,
            source: look.source,
          }
        : text(key, 'Sheet', null)
    }
    case 'enjoyment':
      return text(key, 'Enjoyment', formatCommunityEnjoyment(level.enjoyment))
    case 'duration':
      return text(key, 'Duration', formatDuration(level.durationSeconds))
    case 'objectCount':
      return text(
        key,
        'Objects',
        level.objectCount == null ? null : formatNumber(level.objectCount)
      )
    case 'gameVersion':
      return text(key, 'Version', level.gameVersion)
    case 'ratedAt':
      return text(
        key,
        level.isRated ? 'Rated' : 'Unrated',
        level.ratingStatusSince == null
          ? null
          : RATED_DATE.format(new Date(level.ratingStatusSince))
      )
    case 'coins':
      return text(key, 'Coins', coinsValue(level))
    case 'twoPlayer':
      return text(
        key,
        'Two player',
        level.twoPlayer == null ? null : level.twoPlayer ? 'Yes' : 'No'
      )
    case 'song':
      return text(
        key,
        'Song',
        SONG_TYPE_OPTIONS.find((o) => o.value === level.songType)?.label ??
          null
      )
  }
}

/** Every figure `keys` names, read off one row, in order. */
export function rowStats(
  level: LevelBrowseResult,
  keys: RowStatKey[]
): RowStat[] {
  return keys.map((key) => rowStat(level, key))
}
