import { describe, expect, it, vi } from 'vitest'
import { collectionDetailActions } from '../collectionDetailActions'

const build = (isCustom: boolean) => {
  const handlers = {
    onAddLevels: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }
  return {
    actions: collectionDetailActions({ isCustom, ...handlers }),
    handlers,
  }
}

describe('collectionDetailActions', () => {
  it('offers add, edit, and delete for a custom collection', () => {
    const { actions } = build(true)

    expect(actions.map((a) => a.key)).toEqual(['add', 'edit', 'delete'])
  })

  // Built-ins (Want to Beat, Favorites, Least Favorites) cannot be renamed or
  // deleted, so the FAB must not offer either.
  it('offers only add for a built-in collection', () => {
    const { actions } = build(false)

    expect(actions.map((a) => a.key)).toEqual(['add'])
  })

  // The FAB renders actions[0] as its own button, so "Add levels" leading is
  // load-bearing, not cosmetic.
  it('puts add levels first, as the primary action', () => {
    for (const isCustom of [true, false]) {
      expect(build(isCustom).actions[0]).toMatchObject({
        key: 'add',
        label: 'Add levels',
      })
    }
  })

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
