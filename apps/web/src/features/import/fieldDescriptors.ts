// Per-tab field metadata for FieldConflictMerge — how to label and render
// each conflictable field's value and its manual-entry control.

import { MAX_ATTEMPTS, MAX_FPS, MAX_GDDL_TIER } from '@infernolog/core'

export type FieldFormatType =
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'percent'
  | 'rating10'
  | 'enum'

export interface FieldDescriptor {
  field: string
  label: string
  format: FieldFormatType
  options?: { value: string; label: string }[]
  // Upper bound for a 'number'-format field's manual-entry control — the
  // same bound the server's Zod schema enforces for this field, so a value
  // that passes here also passes at commit time. Only 'number' fields ever
  // set this; a field left undefined falls back to a generic, much looser
  // bound (see FieldConflictMerge's MAX_NUMBER_FIELD) rather than blocking
  // legitimate values for a field this table hasn't catalogued yet.
  max?: number
}

const DIFFICULTY_OPINION_OPTIONS = [
  { value: 'NOT_DEMON_WORTHY', label: 'Not demon-worthy' },
  { value: 'EASY', label: 'Easy' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HARD', label: 'Hard' },
  { value: 'INSANE', label: 'Insane' },
  { value: 'EXTREME', label: 'Extreme' },
]

const DEVICE_OPTIONS = [
  { value: 'pc', label: 'PC' },
  { value: 'mobile', label: 'Mobile' },
]

const VISIBILITY_OPTIONS = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'PRIVATE', label: 'Private' },
]

export const COMPLETION_FIELDS: FieldDescriptor[] = [
  { field: 'date', label: 'Date', format: 'date' },
  { field: 'dateUncertain', label: 'Date uncertain', format: 'boolean' },
  { field: 'attempts', label: 'Attempts', format: 'number', max: MAX_ATTEMPTS },
  { field: 'runFrom', label: 'Run from', format: 'percent' },
  { field: 'runTo', label: 'Run to', format: 'percent' },
  { field: 'fps', label: 'FPS', format: 'number', max: MAX_FPS },
  { field: 'onStream', label: 'On stream', format: 'boolean' },
  { field: 'videoUrl', label: 'Video URL', format: 'text' },
  { field: 'highlightUrl', label: 'Highlight URL', format: 'text' },
  { field: 'notes', label: 'Notes', format: 'text' },
  { field: 'enjoyment', label: 'Enjoyment', format: 'rating10' },
  { field: 'simpleRating', label: 'Simple rating', format: 'rating10' },
  {
    field: 'difficultyOpinion',
    label: 'Difficulty opinion',
    format: 'enum',
    options: DIFFICULTY_OPINION_OPTIONS,
  },
  {
    field: 'difficultyOpinionStars',
    label: 'Difficulty stars',
    format: 'number',
    max: 9,
  },
  {
    field: 'coinsCollected',
    label: 'Coins collected (bitmask)',
    format: 'number',
    max: 7,
  },
  { field: 'twoPlayerSolo', label: 'Two-player solo', format: 'boolean' },
  {
    field: 'twoPlayerPartner',
    label: 'Two-player partner',
    format: 'text',
  },
  { field: 'device', label: 'Device', format: 'enum', options: DEVICE_OPTIONS },
  { field: 'worstFail', label: 'Worst fail %', format: 'percent' },
  { field: 'worstFailDate', label: 'Worst fail date', format: 'date' },
  {
    field: 'visibility',
    label: 'Visibility',
    format: 'enum',
    options: VISIBILITY_OPTIONS,
  },
  { field: 'levelNotes', label: 'Level notes', format: 'text' },
  {
    field: 'userGddlTier',
    label: 'GDDL tier',
    format: 'number',
    max: MAX_GDDL_TIER,
  },
]

export const PROGRESS_FIELDS: FieldDescriptor[] = [
  { field: 'date', label: 'Date', format: 'date' },
  { field: 'dateUncertain', label: 'Date uncertain', format: 'boolean' },
  { field: 'attempts', label: 'Attempts', format: 'number', max: MAX_ATTEMPTS },
  { field: 'percentage', label: 'Percentage', format: 'percent' },
  { field: 'runFrom', label: 'Run from', format: 'percent' },
  { field: 'runTo', label: 'Run to', format: 'percent' },
  { field: 'fps', label: 'FPS', format: 'number', max: MAX_FPS },
  { field: 'onStream', label: 'On stream', format: 'boolean' },
  { field: 'highlightUrl', label: 'Highlight URL', format: 'text' },
  { field: 'notes', label: 'Notes', format: 'text' },
  { field: 'enjoyment', label: 'Enjoyment', format: 'rating10' },
  { field: 'device', label: 'Device', format: 'enum', options: DEVICE_OPTIONS },
]

export const DROPPED_FIELDS: FieldDescriptor[] = [
  { field: 'droppedAt', label: 'Dropped at', format: 'date' },
  { field: 'bestProgress', label: 'Best progress %', format: 'percent' },
  { field: 'runFrom', label: 'Run from', format: 'percent' },
  { field: 'runTo', label: 'Run to', format: 'percent' },
  {
    field: 'attemptsAtDrop',
    label: 'Attempts at drop',
    format: 'number',
    max: MAX_ATTEMPTS,
  },
  { field: 'reason', label: 'Reason', format: 'text' },
]

// 'percent' (0-100), not 'rating10' — unlike completion enjoyment/simpleRating
// (0-10 on the wire), ImportRatingEntry.scores is already 0-100 on the wire,
// and existing/importedScore in ImportRatingConflict match that convention
// so a resolved value drops straight into the payload with no conversion.
export const RATING_FIELDS: FieldDescriptor[] = [
  { field: 'score', label: 'Score', format: 'percent' },
]

function toDescriptorMap(
  fields: FieldDescriptor[]
): Map<string, FieldDescriptor> {
  return new Map(fields.map((f) => [f.field, f]))
}

const COMPLETION_FIELD_MAP = toDescriptorMap(COMPLETION_FIELDS)
const PROGRESS_FIELD_MAP = toDescriptorMap(PROGRESS_FIELDS)
const DROPPED_FIELD_MAP = toDescriptorMap(DROPPED_FIELDS)
const RATING_FIELD_MAP = toDescriptorMap(RATING_FIELDS)

const FIELD_MAPS_BY_TAB: Record<string, Map<string, FieldDescriptor>> = {
  completion: COMPLETION_FIELD_MAP,
  progress: PROGRESS_FIELD_MAP,
  dropped: DROPPED_FIELD_MAP,
  rating: RATING_FIELD_MAP,
}

// Falls back to a title-cased version of the raw field key for any field the
// descriptor table doesn't know about, so an unexpected diff still renders
// something reasonable instead of crashing.
export function describeField(
  tab: keyof typeof FIELD_MAPS_BY_TAB,
  field: string
): FieldDescriptor {
  const known = FIELD_MAPS_BY_TAB[tab]?.get(field)
  if (known) return known
  return {
    field,
    label: field
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (c) => c.toUpperCase()),
    format: 'text',
  }
}
