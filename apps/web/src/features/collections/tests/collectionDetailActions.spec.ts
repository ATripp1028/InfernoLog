import { describe, expect, it, vi } from 'vitest'
import { CollectionOrdering } from '@infernolog/core'
import { collectionDetailActions } from '../collectionDetailActions'

const build = (
  isCustom: boolean,
  convertTo: CollectionOrdering | null = CollectionOrdering.UNORDERED
) => {
  const handlers = {
    onAddLevels: vi.fn(),
    onCopyTo: vi.fn(),
    onConvert: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }
  return {
    actions: collectionDetailActions({ isCustom, convertTo, ...handlers }),
    handlers,
  }
}

describe('collectionDetailActions', () => {
  it('offers everything for a custom collection', () => {
    const { actions } = build(true)

    expect(actions.map((a) => a.key)).toEqual([
      'add',
      'copy',
      'convert',
      'edit',
      'delete',
    ])
  })

  // Built-ins cannot be renamed or deleted, so the FAB must not offer either.
  // Want to Beat can still change its ordering.
  it('drops edit and delete for a built-in collection', () => {
    const { actions } = build(false)

    expect(actions.map((a) => a.key)).toEqual(['add', 'copy', 'convert'])
  })

  // Favorites and Least Favorites are always ordered.
  it('offers no convert where the ordering is fixed', () => {
    const { actions } = build(false, null)

    expect(actions.map((a) => a.key)).toEqual(['add', 'copy'])
  })

  it.each([
    [CollectionOrdering.UNORDERED, 'Convert to unordered'],
    [CollectionOrdering.ORDERED, 'Convert to ordered'],
  ] as const)('labels convert by where it leads (%s)', (convertTo, label) => {
    const { actions } = build(true, convertTo)

    expect(actions.find((a) => a.key === 'convert')?.label).toBe(label)
  })

  // The FAB renders actions[0] as its own button, so "Add levels" leading is
  // load-bearing, not cosmetic.
  it('puts add levels first, as the primary action', () => {
    for (const isCustom of [true, false]) {
      for (const convertTo of [CollectionOrdering.ORDERED, null]) {
        expect(build(isCustom, convertTo).actions[0]).toMatchObject({
          key: 'add',
          label: 'Add levels',
        })
      }
    }
  })

  // Converting to unordered loses the order, but the confirm dialog carries
  // that warning — the FAB entry itself only opens it.
  it('flags only delete as dangerous', () => {
    const { actions } = build(true)

    expect(actions.filter((a) => a.danger).map((a) => a.key)).toEqual([
      'delete',
    ])
  })

  it('gives every action a label and an icon', () => {
    for (const action of build(true).actions) {
      expect(action.label).toBeTruthy()
      expect(action.icon).toBeTruthy()
    }
  })

  it.each([
    ['add', 'onAddLevels'],
    ['copy', 'onCopyTo'],
    ['convert', 'onConvert'],
    ['edit', 'onEdit'],
    ['delete', 'onDelete'],
  ] as const)('wires %s to %s', (key, handlerName) => {
    const { actions, handlers } = build(true)

    actions.find((a) => a.key === key)!.onClick()

    expect(handlers[handlerName]).toHaveBeenCalledOnce()
    for (const [name, spy] of Object.entries(handlers)) {
      if (name !== handlerName) expect(spy).not.toHaveBeenCalled()
    }
  })
})
