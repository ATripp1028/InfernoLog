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
import { FieldError } from '@/components/ui/field-error'
import { describeField, type FieldDescriptor } from './fieldDescriptors'
import {
  formatDisplayValue,
  manualValueError,
  numericMax,
  useFieldConflictMerge,
  type ConflictGroup,
  type GroupResolution,
} from './useFieldConflictMerge'

export type { ConflictGroup, GroupResolution }

interface FieldConflictMergeProps {
  tab: 'completion' | 'progress' | 'dropped' | 'rating'
  groups: ConflictGroup[]
  onResolved: (resolved: Map<string, GroupResolution>) => void
  onCancel: () => void
}

function ManualEntry({
  descriptor,
  value,
  onChange,
}: {
  descriptor: FieldDescriptor
  value: unknown
  onChange: (v: unknown) => void
}) {
  const { format, options } = descriptor
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
    const max = numericMax(descriptor)
    const error = manualValueError(descriptor, value)
    return (
      <div>
        <Input
          type="number"
          min={0}
          max={max ?? undefined}
          step={format === 'rating10' ? 0.1 : 1}
          value={value == null ? '' : String(value)}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') {
              onChange(null)
              return
            }
            const n = Number(raw)
            onChange(Number.isFinite(n) ? n : null)
          }}
        />
        {error && <FieldError>{error}</FieldError>}
      </div>
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

/**
 * Canonical git-merge-style conflict resolver. Given a set of conflicting
 * "groups" (one per row that has field-level diffs — a completion, a matched
 * progress/dropped entry, or a rating), each group is resolved one of three
 * ways: drop the imported row entirely, keep resolving field-by-field
 * (produces 'overwrite' or 'merge' depending on the mix of choices — see
 * below), per group or across every group at once.
 *
 * Every group must be either dropped or have every field explicitly chosen
 * before submitting — mirrors the old ConflictStep's `unresolvedCount > 0`
 * gate. A non-dropped group whose every field resolved to "imported" (zero
 * existing/manual picks) reports as 'overwrite'; any mix reports as 'merge'
 * — this is purely a label for outcome-reporting text, computed from the
 * actual choices rather than tracked separately, since "every field is the
 * imported value" and "a true overwrite" are the same outcome.
 */
export function FieldConflictMerge({
  tab,
  groups,
  onResolved,
  onCancel,
}: FieldConflictMergeProps) {
  const {
    choices,
    droppedGroups,
    resolvedGroupCount,
    allResolved,
    setFieldChoice,
    dropGroup,
    undropGroup,
    applyToGroup,
    dropAll,
    applyToAll,
    handleSubmit,
  } = useFieldConflictMerge({ tab, groups, onResolved })

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
          <Button
            size="sm"
            variant="outline"
            onClick={() => applyToAll('existing')}
          >
            Keep existing for all
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => applyToAll('imported')}
          >
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
              className="rounded-lg border border-border p-4 space-y-3"
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
                <div className="divide-y divide-border">
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
                            descriptor={descriptor}
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

      <div className="flex gap-3 border-t border-border pt-4">
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
