// Logic for FieldConflictMerge: the per-group resolution state (drop, or a
// choice per field), the bulk apply/drop actions, the "everything resolved"
// gate, and the GroupResolution map handed back on submit. Also holds the
// field-value helpers the resolver's rows format and validate against.
//
// A non-dropped group whose every field resolved to "imported" (zero
// existing/manual picks) reports as 'overwrite'; any mix reports as 'merge'
// — this is purely a label for outcome-reporting text, computed from the
// actual choices rather than tracked separately, since "every field is the
// imported value" and "a true overwrite" are the same outcome.

import { useMemo, useState } from 'react'
import { MAX_ATTEMPTS } from '@infernolog/core'
import { maxValueError } from '@/lib/numberFormat'
import {
  describeField,
  type FieldDescriptor,
  type FieldFormatType,
} from './fieldDescriptors'

// Fallback upper bound for a 'number'-format field whose descriptor doesn't
// specify a tighter one (see FieldDescriptor.max) — without it a
// pasted/mistyped huge value overflows the Postgres Int column it's
// eventually written to.
const MAX_NUMBER_FIELD = MAX_ATTEMPTS

/**
 * The upper bound a `number`-format field's manual entry accepts.
 *
 * Falls back to a generic loose bound for a field whose descriptor has not
 * catalogued one, rather than blocking a legitimate value — see
 * `FieldDescriptor.max`.
 *
 * @returns `null` for formats that are not numeric.
 */
export function numericMax(descriptor: FieldDescriptor): number | null {
  if (descriptor.format === 'percent') return 100
  if (descriptor.format === 'rating10') return 10
  if (descriptor.format === 'number') return descriptor.max ?? MAX_NUMBER_FIELD
  return null
}

/**
 * Manual-entry validation error for this field, or null when the value is
 * valid — shares format.ts's numberExceedsMax/maxValueError (the logging
 * wizard's own numeric-field validator) rather than a second copy of the
 * same "exceeds max" rule and message.
 */
export function manualValueError(
  descriptor: FieldDescriptor,
  value: unknown
): string | null {
  const max = numericMax(descriptor)
  if (max == null || typeof value !== 'number') return null
  return maxValueError(String(value), max)
}

// Whether a manually-entered value for this field exceeds its max — used to
// BLOCK resolving (not silently clamp) so a pasted/mistyped huge number gets
// a visible error instead of vanishing into a smaller value.
function manualValueExceedsMax(
  descriptor: FieldDescriptor,
  value: unknown
): boolean {
  return manualValueError(descriptor, value) != null
}

/**
 * One field inside a conflict group: its descriptor plus the two competing values.
 */
export interface ConflictGroupField {
  field: string
  existingValue: unknown
  importedValue: unknown
}

/**
 * One conflicting row, presented as a set of fields to resolve.
 */
export interface ConflictGroup {
  groupId: string
  title: string
  subtitle?: string
  fields: ConflictGroupField[]
}

/**
 * How one group was resolved — dropped, or a per-field set of choices reported as `overwrite`/`merge`.
 */
export interface GroupResolution {
  resolution: 'drop' | 'overwrite' | 'merge'
  // Only fields whose winner isn't "imported" — a field left at "imported"
  // needs no override, the row's parsed value is already correct. Empty for
  // 'drop'.
  values: Record<string, unknown>
}

/**
 * Which side a field resolved to: the existing value, the imported one, or a hand-typed replacement.
 */
export type ChoiceKind = 'imported' | 'existing' | 'manual'
/**
 * The chosen value for one field, with the {@link ChoiceKind} that produced it.
 */
export interface FieldChoice {
  kind: ChoiceKind
  manualValue?: unknown
}

/**
 * Renders a conflict value for display according to its field's format. Handles the null/blank case so rows do not print `null`.
 */
export function formatDisplayValue(
  value: unknown,
  format: FieldFormatType
): string {
  if (value == null || value === '') return '(blank)'
  if (format === 'boolean') return value ? 'Yes' : 'No'
  if (format === 'percent') return `${value}%`
  if (format === 'rating10') return `${Number(value).toFixed(1)} / 10`
  return String(value)
}

/**
 * Per-group resolution state, the bulk apply/drop actions, and the submit gate for the field-conflict resolver.
 */
export function useFieldConflictMerge({
  tab,
  groups,
  onResolved,
}: {
  tab: 'completion' | 'progress' | 'dropped' | 'rating'
  groups: ConflictGroup[]
  onResolved: (resolved: Map<string, GroupResolution>) => void
}) {
  const [choices, setChoices] = useState<
    Record<string, Record<string, FieldChoice>>
  >({})
  const [droppedGroups, setDroppedGroups] = useState<Set<string>>(new Set())

  const isFieldResolved = (
    groupField: ConflictGroupField,
    choice: FieldChoice | undefined
  ) => {
    if (!choice) return false
    if (choice.kind === 'manual') {
      const descriptor = describeField(tab, groupField.field)
      if (manualValueExceedsMax(descriptor, choice.manualValue)) return false
    }
    return true
  }

  const isGroupResolved = (group: ConflictGroup) =>
    droppedGroups.has(group.groupId) ||
    group.fields.every((f) =>
      isFieldResolved(f, choices[group.groupId]?.[f.field])
    )

  const resolvedGroupCount = useMemo(
    () => groups.filter(isGroupResolved).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, choices, droppedGroups]
  )
  const allResolved = groups.length > 0 && resolvedGroupCount === groups.length

  const setFieldChoice = (
    groupId: string,
    field: string,
    choice: FieldChoice
  ) => {
    setDroppedGroups((prev) => {
      if (!prev.has(groupId)) return prev
      const next = new Set(prev)
      next.delete(groupId)
      return next
    })
    setChoices((prev) => ({
      ...prev,
      [groupId]: { ...prev[groupId], [field]: choice },
    }))
  }

  const dropGroup = (groupId: string) => {
    setDroppedGroups((prev) => new Set(prev).add(groupId))
  }

  const undropGroup = (groupId: string) => {
    setDroppedGroups((prev) => {
      const next = new Set(prev)
      next.delete(groupId)
      return next
    })
  }

  const applyToGroup = (groupId: string, kind: 'imported' | 'existing') => {
    const group = groups.find((g) => g.groupId === groupId)
    if (!group) return
    undropGroup(groupId)
    setChoices((prev) => ({
      ...prev,
      [groupId]: Object.fromEntries(
        group.fields.map((f) => [f.field, { kind }])
      ),
    }))
  }

  const dropAll = () => setDroppedGroups(new Set(groups.map((g) => g.groupId)))

  const applyToAll = (kind: 'imported' | 'existing') => {
    setDroppedGroups(new Set())
    setChoices(
      Object.fromEntries(
        groups.map((g) => [
          g.groupId,
          Object.fromEntries(g.fields.map((f) => [f.field, { kind }])),
        ])
      )
    )
  }

  const handleSubmit = () => {
    const resolved = new Map<string, GroupResolution>()
    for (const group of groups) {
      if (droppedGroups.has(group.groupId)) {
        resolved.set(group.groupId, { resolution: 'drop', values: {} })
        continue
      }
      const groupChoices = choices[group.groupId] ?? {}
      let allImported = true
      const values: Record<string, unknown> = {}
      for (const f of group.fields) {
        const choice = groupChoices[f.field]
        if (!choice || choice.kind === 'imported') continue
        allImported = false
        values[f.field] =
          choice.kind === 'existing' ? f.existingValue : choice.manualValue
      }
      resolved.set(group.groupId, {
        resolution: allImported ? 'overwrite' : 'merge',
        values,
      })
    }
    onResolved(resolved)
  }

  return {
    choices,
    droppedGroups,
    isGroupResolved,
    resolvedGroupCount,
    allResolved,

    // Per-group
    setFieldChoice,
    dropGroup,
    undropGroup,
    applyToGroup,

    // Bulk
    dropAll,
    applyToAll,

    handleSubmit,
  }
}
