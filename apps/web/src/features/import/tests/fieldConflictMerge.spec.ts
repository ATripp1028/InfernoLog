import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MAX_ATTEMPTS, MAX_FPS } from '@infernolog/core'
import {
  COMPLETION_FIELDS,
  DROPPED_FIELDS,
  PROGRESS_FIELDS,
  RATING_FIELDS,
  describeField,
  type FieldDescriptor,
} from '../fieldDescriptors'
import {
  formatDisplayValue,
  manualValueError,
  numericMax,
  useFieldConflictMerge,
  type ConflictGroup,
  type GroupResolution,
} from '../useFieldConflictMerge'

const descriptor = (overrides: Partial<FieldDescriptor>): FieldDescriptor => ({
  field: 'attempts',
  label: 'Attempts',
  format: 'number',
  ...overrides,
})

describe('describeField', () => {
  it.each([
    ['completion', 'attempts', 'Attempts'],
    ['progress', 'percentage', 'Percentage'],
    ['dropped', 'bestProgress', 'Best progress %'],
    ['rating', 'score', 'Score'],
  ] as const)('describes the known %s field %s', (tab, field, label) => {
    expect(describeField(tab, field).label).toBe(label)
  })

  // An unexpected diff must still render rather than crash the resolver.
  it('falls back to a title-cased label for an uncatalogued field', () => {
    expect(describeField('completion', 'someNewField')).toEqual({
      field: 'someNewField',
      label: 'Some New Field',
      format: 'text',
    })
  })

  it('title-cases a single-word unknown field', () => {
    expect(describeField('completion', 'whatever').label).toBe('Whatever')
  })

  it('falls back for a field that belongs to a different tab', () => {
    expect(describeField('rating', 'attempts').format).toBe('text')
  })

  it('falls back for an unknown tab', () => {
    expect(describeField('nonsense' as never, 'attempts').format).toBe('text')
  })

  it.each([
    ['completion', COMPLETION_FIELDS],
    ['progress', PROGRESS_FIELDS],
    ['dropped', DROPPED_FIELDS],
    ['rating', RATING_FIELDS],
  ] as const)('resolves every catalogued %s field to itself', (tab, fields) => {
    for (const f of fields) {
      expect(describeField(tab, f.field)).toBe(f)
    }
  })

  it.each([
    ['completion', COMPLETION_FIELDS],
    ['progress', PROGRESS_FIELDS],
    ['dropped', DROPPED_FIELDS],
    ['rating', RATING_FIELDS],
  ] as const)('declares each %s field exactly once', (_tab, fields) => {
    const keys = fields.map((f) => f.field)
    expect(new Set(keys).size).toBe(keys.length)
  })

  // An enum field with no options renders an empty picker the user cannot
  // resolve, which would deadlock the resolver's "all resolved" gate.
  it('gives every enum field its options', () => {
    const all = [...COMPLETION_FIELDS, ...PROGRESS_FIELDS, ...DROPPED_FIELDS]
    for (const f of all.filter((f) => f.format === 'enum')) {
      expect(f.options?.length ?? 0).toBeGreaterThan(0)
    }
  })
})

describe('numericMax', () => {
  it.each([
    ['percent', 100],
    ['rating10', 10],
  ] as const)('bounds a %s field at %s', (format, max) => {
    expect(numericMax(descriptor({ format }))).toBe(max)
  })

  it('uses the bound a number field catalogued for itself', () => {
    expect(numericMax(descriptor({ format: 'number', max: MAX_FPS }))).toBe(
      MAX_FPS
    )
  })

  // A field the table has not catalogued gets a loose bound rather than a
  // tight one — the point is to stop an Int-column overflow, not to reject
  // legitimate values for a field nobody has described yet.
  it('falls back to a loose bound for an uncatalogued number field', () => {
    expect(numericMax(descriptor({ format: 'number' }))).toBe(MAX_ATTEMPTS)
  })

  it.each(['text', 'date', 'boolean', 'enum'] as const)(
    'leaves a %s field unbounded',
    (format) => {
      expect(numericMax(descriptor({ format }))).toBeNull()
    }
  )

  // Every catalogued bound has to match the server's Zod schema, or a value
  // that passes here fails at commit after the whole wizard has been walked.
  it('bounds each catalogued number field at its server limit', () => {
    const bounds = [...COMPLETION_FIELDS, ...PROGRESS_FIELDS, ...DROPPED_FIELDS]
      .filter((f) => f.max != null)
      .map((f) => f.max!)

    for (const max of bounds) {
      expect(max).toBeGreaterThan(0)
      expect(max).toBeLessThanOrEqual(MAX_ATTEMPTS)
    }
  })
})

describe('manualValueError', () => {
  it('accepts a value inside the bound', () => {
    expect(manualValueError(descriptor({ format: 'percent' }), 100)).toBeNull()
  })

  it('rejects a value over the bound, naming the limit', () => {
    expect(manualValueError(descriptor({ format: 'percent' }), 101)).toBe(
      'Must be 100 or less'
    )
  })

  // Blocking rather than clamping is deliberate: a pasted or mistyped huge
  // number must show an error, not silently become a smaller value.
  it('rejects a pasted huge number on an uncatalogued field', () => {
    expect(
      manualValueError(descriptor({ format: 'number' }), 10 ** 12)
    ).not.toBeNull()
  })

  it('groups the limit with thousands separators', () => {
    expect(
      manualValueError(descriptor({ format: 'number', max: 10000 }), 99999)
    ).toBe('Must be 10,000 or less')
  })

  it.each([
    ['a non-numeric field', descriptor({ format: 'text' }), 'anything'],
    ['a non-number value', descriptor({ format: 'number' }), 'abc'],
    ['a null value', descriptor({ format: 'number' }), null],
  ])('has nothing to say about %s', (_label, d, value) => {
    expect(manualValueError(d, value)).toBeNull()
  })
})

describe('formatDisplayValue', () => {
  // Rows must never print a bare "null" at the user.
  it.each([null, undefined, ''])('renders %s as (blank)', (value) => {
    expect(formatDisplayValue(value, 'text')).toBe('(blank)')
  })

  it.each([
    [true, 'Yes'],
    [false, 'No'],
  ])('renders the boolean %s as %s', (value, expected) => {
    expect(formatDisplayValue(value, 'boolean')).toBe(expected)
  })

  it('suffixes a percent', () => {
    expect(formatDisplayValue(87, 'percent')).toBe('87%')
  })

  it('renders a 0-10 rating to one decimal, out of 10', () => {
    expect(formatDisplayValue(7, 'rating10')).toBe('7.0 / 10')
    expect(formatDisplayValue(7.25, 'rating10')).toBe('7.3 / 10')
  })

  it('stringifies anything else', () => {
    expect(formatDisplayValue(42, 'number')).toBe('42')
    expect(formatDisplayValue('2026-01-01', 'date')).toBe('2026-01-01')
  })

  // Zero is a real value on every numeric format and must survive the blank
  // check, which tests for null/'' rather than falsiness.
  it.each([
    ['percent', '0%'],
    ['rating10', '0.0 / 10'],
    ['number', '0'],
  ] as const)('renders a zero %s rather than (blank)', (format, expected) => {
    expect(formatDisplayValue(0, format)).toBe(expected)
  })

  it('renders a false boolean as No rather than (blank)', () => {
    expect(formatDisplayValue(false, 'boolean')).toBe('No')
  })
})

describe('useFieldConflictMerge', () => {
  const group = (
    groupId: string,
    fields: string[] = ['attempts', 'percentage']
  ): ConflictGroup => ({
    groupId,
    title: `Group ${groupId}`,
    fields: fields.map((field, i) => ({
      field,
      existingValue: 10 + i,
      importedValue: 20 + i,
    })),
  })

  const render = (groups: ConflictGroup[] = [group('a'), group('b')]) => {
    const onResolved = vi.fn<(r: Map<string, GroupResolution>) => void>()
    const view = renderHook(() =>
      useFieldConflictMerge({ tab: 'completion', groups, onResolved })
    )
    return { ...view, onResolved, groups }
  }

  /** The map handed to onResolved by the most recent submit. */
  const submitted = (onResolved: ReturnType<typeof vi.fn>) => {
    const { calls } = onResolved.mock
    return calls[calls.length - 1]![0] as Map<string, GroupResolution>
  }

  describe('the submit gate', () => {
    it('starts unresolved', () => {
      const { result } = render()

      expect(result.current.allResolved).toBe(false)
      expect(result.current.resolvedGroupCount).toBe(0)
    })

    it('counts a group only once every field is chosen', () => {
      const { result } = render()

      act(() =>
        result.current.setFieldChoice('a', 'attempts', { kind: 'imported' })
      )
      expect(result.current.resolvedGroupCount).toBe(0)

      act(() =>
        result.current.setFieldChoice('a', 'percentage', { kind: 'existing' })
      )
      expect(result.current.resolvedGroupCount).toBe(1)
    })

    it('counts a dropped group as resolved without any field choices', () => {
      const { result, groups } = render()

      act(() => result.current.dropGroup('a'))

      expect(result.current.isGroupResolved(groups[0]!)).toBe(true)
      expect(result.current.isGroupResolved(groups[1]!)).toBe(false)
      expect(result.current.resolvedGroupCount).toBe(1)
    })

    it('opens the gate once every group is resolved', () => {
      const { result } = render()

      act(() => result.current.applyToAll('imported'))

      expect(result.current.allResolved).toBe(true)
    })

    // An out-of-range manual entry must hold the gate shut rather than
    // submitting a value the server will reject.
    it('holds the gate shut for an out-of-range manual value', () => {
      const { result } = render([group('a', ['attempts'])])

      act(() =>
        result.current.setFieldChoice('a', 'attempts', {
          kind: 'manual',
          manualValue: MAX_ATTEMPTS + 1,
        })
      )

      expect(result.current.allResolved).toBe(false)
    })

    it('opens once the manual value is brought back in range', () => {
      const { result } = render([group('a', ['attempts'])])
      act(() =>
        result.current.setFieldChoice('a', 'attempts', {
          kind: 'manual',
          manualValue: MAX_ATTEMPTS + 1,
        })
      )

      act(() =>
        result.current.setFieldChoice('a', 'attempts', {
          kind: 'manual',
          manualValue: 5,
        })
      )

      expect(result.current.allResolved).toBe(true)
    })

    // Nothing to resolve is not the same as everything resolved — the caller
    // skips the step entirely rather than rendering an enabled submit.
    it('stays shut for an empty group list', () => {
      const { result } = render([])

      expect(result.current.allResolved).toBe(false)
    })
  })

  describe('per-group actions', () => {
    it('applies one side to every field in a group', () => {
      const { result } = render()

      act(() => result.current.applyToGroup('a', 'existing'))

      expect(result.current.choices.a).toEqual({
        attempts: { kind: 'existing' },
        percentage: { kind: 'existing' },
      })
      expect(result.current.choices.b).toBeUndefined()
    })

    it('ignores an unknown group', () => {
      const { result } = render()

      act(() => result.current.applyToGroup('nope', 'imported'))

      expect(result.current.choices).toEqual({})
    })

    // Choosing a field for a dropped group means the user changed their mind
    // about dropping it, so the drop is lifted rather than silently ignored.
    it('un-drops a group when a field is chosen on it', () => {
      const { result } = render()
      act(() => result.current.dropGroup('a'))

      act(() =>
        result.current.setFieldChoice('a', 'attempts', { kind: 'imported' })
      )

      expect(result.current.droppedGroups.has('a')).toBe(false)
    })

    it('un-drops a group when a side is applied to it', () => {
      const { result } = render()
      act(() => result.current.dropGroup('a'))

      act(() => result.current.applyToGroup('a', 'imported'))

      expect(result.current.droppedGroups.has('a')).toBe(false)
    })

    it('drops and un-drops on demand', () => {
      const { result } = render()

      act(() => result.current.dropGroup('a'))
      expect(result.current.droppedGroups.has('a')).toBe(true)

      act(() => result.current.undropGroup('a'))
      expect(result.current.droppedGroups.has('a')).toBe(false)
    })
  })

  describe('bulk actions', () => {
    it('applies one side to every field of every group', () => {
      const { result } = render()

      act(() => result.current.applyToAll('imported'))

      expect(Object.keys(result.current.choices)).toEqual(['a', 'b'])
      expect(result.current.choices.b!.percentage).toEqual({
        kind: 'imported',
      })
    })

    it('drops every group', () => {
      const { result } = render()

      act(() => result.current.dropAll())

      expect(result.current.droppedGroups.size).toBe(2)
      expect(result.current.allResolved).toBe(true)
    })

    it('clears every drop when a side is applied to all', () => {
      const { result } = render()
      act(() => result.current.dropAll())

      act(() => result.current.applyToAll('existing'))

      expect(result.current.droppedGroups.size).toBe(0)
    })
  })

  describe('the resolution handed back', () => {
    it('reports a dropped group as drop, with no values', () => {
      const { result, onResolved } = render()
      act(() => result.current.dropAll())

      act(() => result.current.handleSubmit())

      expect(submitted(onResolved).get('a')).toEqual({
        resolution: 'drop',
        values: {},
      })
    })

    // "Every field is the imported value" and "a true overwrite" are the same
    // outcome, so the label is computed rather than tracked separately.
    it('reports an all-imported group as overwrite, with no values', () => {
      const { result, onResolved } = render()
      act(() => result.current.applyToAll('imported'))

      act(() => result.current.handleSubmit())

      expect(submitted(onResolved).get('a')).toEqual({
        resolution: 'overwrite',
        values: {},
      })
    })

    it('reports any other mix as merge', () => {
      const { result, onResolved } = render()
      act(() => result.current.applyToAll('imported'))
      act(() =>
        result.current.setFieldChoice('a', 'attempts', { kind: 'existing' })
      )

      act(() => result.current.handleSubmit())

      expect(submitted(onResolved).get('a')!.resolution).toBe('merge')
      expect(submitted(onResolved).get('b')!.resolution).toBe('overwrite')
    })

    // `values` carries only the fields that did NOT win as imported — an
    // imported field's value is already correct in the parsed row.
    it('carries only the fields whose winner was not the imported one', () => {
      const { result, onResolved } = render()
      act(() => result.current.applyToAll('imported'))
      act(() =>
        result.current.setFieldChoice('a', 'attempts', { kind: 'existing' })
      )

      act(() => result.current.handleSubmit())

      expect(submitted(onResolved).get('a')!.values).toEqual({ attempts: 10 })
    })

    it('carries the typed value for a manual choice', () => {
      const { result, onResolved } = render()
      act(() => result.current.applyToAll('imported'))
      act(() =>
        result.current.setFieldChoice('a', 'percentage', {
          kind: 'manual',
          manualValue: 73,
        })
      )

      act(() => result.current.handleSubmit())

      expect(submitted(onResolved).get('a')!.values).toEqual({ percentage: 73 })
    })

    // A group left entirely untouched still has to appear, or the commit
    // would treat it as never having conflicted.
    it('reports an untouched group as overwrite rather than omitting it', () => {
      const { result, onResolved } = render()

      act(() => result.current.handleSubmit())

      expect([...submitted(onResolved).keys()]).toEqual(['a', 'b'])
      expect(submitted(onResolved).get('a')).toEqual({
        resolution: 'overwrite',
        values: {},
      })
    })

    it('reports every group exactly once', () => {
      const { result, onResolved } = render([
        group('a'),
        group('b'),
        group('c'),
      ])
      act(() => result.current.dropGroup('b'))

      act(() => result.current.handleSubmit())

      expect(submitted(onResolved).size).toBe(3)
    })
  })
})
