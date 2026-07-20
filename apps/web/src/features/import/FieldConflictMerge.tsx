// Canonical git-merge-style conflict resolver. Given a set of conflicting
// "groups" (one per row that has field-level diffs — a completion, a matched
// progress/dropped entry, or a rating), each group is resolved one of three
// ways: drop the imported row entirely, keep resolving field-by-field
// (produces 'overwrite' or 'merge' depending on the mix of choices — see
// below), per group or across every group at once.
//
// Every group must be either dropped or have every field explicitly chosen
// before submitting — mirrors the old ConflictStep's `unresolvedCount > 0`
// gate. A non-dropped group whose every field resolved to "imported" (zero
// existing/manual picks) reports as 'overwrite'; any mix reports as 'merge'
// — this is purely a label for outcome-reporting text, computed from the
// actual choices rather than tracked separately, since "every field is the
// imported value" and "a true overwrite" are the same outcome.

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { describeField, type FieldFormatType } from './fieldDescriptors'

export interface ConflictGroupField {
  field: string
  existingValue: unknown
  importedValue: unknown
}

export interface ConflictGroup {
  groupId: string
  title: string
  subtitle?: string
  fields: ConflictGroupField[]
}

export interface GroupResolution {
  resolution: 'drop' | 'overwrite' | 'merge'
  // Only fields whose winner isn't "imported" — a field left at "imported"
  // needs no override, the row's parsed value is already correct. Empty for
  // 'drop'.
  values: Record<string, unknown>
}

type ChoiceKind = 'imported' | 'existing' | 'manual'
interface FieldChoice {
  kind: ChoiceKind
  manualValue?: unknown
}

interface FieldConflictMergeProps {
  tab: 'completion' | 'rating'
  groups: ConflictGroup[]
  onResolved: (resolved: Map<string, GroupResolution>) => void
  onCancel: () => void
}

function formatDisplayValue(value: unknown, format: FieldFormatType): string {
  if (value == null || value === '') return '(blank)'
  if (format === 'boolean') return value ? 'Yes' : 'No'
  if (format === 'percent') return `${value}%`
  if (format === 'rating10') return `${Number(value).toFixed(1)} / 10`
  return String(value)
}

function ManualEntry({
  format,
  options,
  value,
  onChange,
}: {
  format: FieldFormatType
  options?: { value: string; label: string }[] | undefined
  value: unknown
  onChange: (v: unknown) => void
}) {
  if (format === 'boolean') {
    return <Switch checked={value === true} onCheckedChange={onChange} />
  }
  if (format === 'enum' && options) {
    return (
      <Select value={(value as string) ?? ''} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (format === 'date') {
    return (
      <Input
        type="date"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      />
    )
  }
  if (format === 'number' || format === 'percent' || format === 'rating10') {
    return (
      <Input
        type="number"
        min={0}
        max={format === 'percent' ? 100 : format === 'rating10' ? 10 : undefined}
        step={format === 'rating10' ? 0.1 : 1}
        value={value == null ? '' : String(value)}
        onChange={(e) => {
          const raw = e.target.value
          onChange(raw === '' ? null : Number(raw))
        }}
      />
    )
  }
  return (
    <Input
      type="text"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    />
  )
}

export function FieldConflictMerge({
  tab,
  groups,
  onResolved,
  onCancel,
}: FieldConflictMergeProps) {
  const [choices, setChoices] = useState<
    Record<string, Record<string, FieldChoice>>
  >({})
  const [droppedGroups, setDroppedGroups] = useState<Set<string>>(new Set())

  const isGroupResolved = (group: ConflictGroup) =>
    droppedGroups.has(group.groupId) ||
    group.fields.every((f) => choices[group.groupId]?.[f.field])

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
      [groupId]: Object.fromEntries(group.fields.map((f) => [f.field, { kind }])),
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {resolvedGroupCount} of {groups.length} level
          {groups.length !== 1 ? 's' : ''} resolved.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={dropAll}>
            Drop all
          </Button>
          <Button size="sm" variant="outline" onClick={() => applyToAll('existing')}>
            Keep existing for all
          </Button>
          <Button size="sm" variant="outline" onClick={() => applyToAll('imported')}>
            Use imported for all
          </Button>
        </div>
      </div>

      <div className="max-h-[28rem] space-y-4 overflow-y-auto pr-1">
        {groups.map((group) => {
          const dropped = droppedGroups.has(group.groupId)
          return (
            <div
              key={group.groupId}
              className="rounded-lg border border-[var(--color-border)] p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{group.title}</p>
                  {group.subtitle && (
                    <p className="text-xs text-muted-foreground">
                      {group.subtitle}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {dropped ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => undropGroup(group.groupId)}
                    >
                      Undo drop
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => dropGroup(group.groupId)}
                      >
                        Drop
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => applyToGroup(group.groupId, 'existing')}
                      >
                        Keep existing
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => applyToGroup(group.groupId, 'imported')}
                      >
                        Use imported
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {dropped ? (
                <p className="text-xs text-muted-foreground">
                  This row will be discarded — the existing data stays as-is.
                </p>
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {group.fields.map((f) => {
                    const descriptor = describeField(tab, f.field)
                    const choice = choices[group.groupId]?.[f.field]
                    return (
                      <div key={f.field} className="space-y-2 py-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          {descriptor.label}
                        </p>
                        <Segmented
                          fill={false}
                          options={[
                            {
                              value: 'imported' as const,
                              label: `Imported: ${formatDisplayValue(f.importedValue, descriptor.format)}`,
                            },
                            {
                              value: 'existing' as const,
                              label: `Existing: ${formatDisplayValue(f.existingValue, descriptor.format)}`,
                            },
                            { value: 'manual' as const, label: 'Manual' },
                          ]}
                          value={choice?.kind ?? null}
                          onChange={(kind) =>
                            setFieldChoice(group.groupId, f.field, {
                              kind,
                              manualValue:
                                kind === 'manual'
                                  ? (choice?.manualValue ?? null)
                                  : undefined,
                            })
                          }
                        />
                        {choice?.kind === 'manual' && (
                          <ManualEntry
                            format={descriptor.format}
                            options={descriptor.options}
                            value={choice.manualValue}
                            onChange={(v) =>
                              setFieldChoice(group.groupId, f.field, {
                                kind: 'manual',
                                manualValue: v,
                              })
                            }
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex gap-3 border-t border-[var(--color-border)] pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!allResolved}>
          {allResolved
            ? `Resolve ${groups.length} level${groups.length !== 1 ? 's' : ''}`
            : `Resolve ${groups.length - resolvedGroupCount} remaining level${
                groups.length - resolvedGroupCount !== 1 ? 's' : ''
              }`}
        </Button>
      </div>
    </div>
  )
}
