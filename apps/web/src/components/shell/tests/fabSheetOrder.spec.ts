import { describe, expect, it } from 'vitest'
import type { FabAction } from '@/context/FabActionsContext'
import { opensSheet, sheetActionOrder } from '../fabSheetOrder'

const action = (key: string): FabAction =>
  ({ key, label: key, icon: () => null, onClick: () => {} }) as unknown as FabAction

const keys = (actions: readonly FabAction[]) => actions.map((a) => a.key)

// The context hands over secondaryActions farthest-from-FAB-first, which is
// what the desktop speed dial fans out bottom-up.
describe('sheetActionOrder', () => {
  it('leads with the primary action', () => {
    const order = sheetActionOrder(action('log'), [action('delete')])

    expect(order[0]!.key).toBe('log')
  })

  // Undoing the fan-out reversal is the whole job: the sheet reads top to
  // bottom, the dial reads bottom up.
  it('undoes the fan-out reversal', () => {
    const order = sheetActionOrder(action('log'), [
      action('delete'),
      action('edit'),
    ])

    expect(keys(order)).toEqual(['log', 'edit', 'delete'])
  })

  // Delete lands at the bottom, where it is hardest to hit by accident.
  it('puts the most consequential action last', () => {
    const order = sheetActionOrder(action('primary'), [
      action('delete'),
      action('edit'),
      action('share'),
    ])

    expect(order[order.length - 1]!.key).toBe('delete')
  })

  it('handles a lone primary action', () => {
    expect(keys(sheetActionOrder(action('new'), []))).toEqual(['new'])
  })

  it('loses no action along the way', () => {
    const secondary = [action('a'), action('b'), action('c')]

    expect(sheetActionOrder(action('p'), secondary)).toHaveLength(4)
  })

  it('leaves the context’s array untouched', () => {
    const secondary = [action('delete'), action('edit')]

    sheetActionOrder(action('log'), secondary)

    expect(keys(secondary)).toEqual(['delete', 'edit'])
  })

  // The desktop dial renders secondaryActions as given; reading the sheet
  // bottom-up must give back that same order.
  it('reads bottom-up as the desktop dial reads top-down', () => {
    const secondary = [action('delete'), action('edit')]
    const order = sheetActionOrder(action('log'), secondary)

    expect(keys(order.slice(1).reverse())).toEqual(keys(secondary))
  })
})

describe('opensSheet', () => {
  // A page registering one action triggers it directly — a sheet with a
  // single row in it is pure friction.
  it('fires directly when there is nothing to choose between', () => {
    expect(opensSheet([])).toBe(false)
  })

  it('opens the sheet once there is a choice', () => {
    expect(opensSheet([action('edit')])).toBe(true)
  })

  it('opens the sheet for a full action set', () => {
    expect(opensSheet([action('delete'), action('edit')])).toBe(true)
  })
})
