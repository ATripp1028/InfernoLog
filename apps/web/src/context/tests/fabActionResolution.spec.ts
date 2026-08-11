import { describe, expect, it } from 'vitest'
import type { FabAction } from '../FabActionsContext'
import { actionsSignature, resolveFabActions } from '../fabActionResolution'
import { sheetActionOrder } from '@/components/shell/fabSheetOrder'

const action = (
  key: string,
  overrides: Partial<FabAction> = {}
): FabAction =>
  ({
    key,
    label: key,
    icon: () => null,
    onClick: () => {},
    ...overrides,
  }) as unknown as FabAction

const keys = (actions: readonly FabAction[]) => actions.map((a) => a.key)

describe('resolveFabActions', () => {
  it('takes the first action as the FAB itself', () => {
    const { primary } = resolveFabActions([action('log'), action('edit')])

    expect(primary.key).toBe('log')
  })

  // Authoring order puts the most consequential action first so it lands
  // furthest from the thumb once the stack fans out bottom-up.
  it('reverses the rest into fan-out order', () => {
    const { secondaryActions } = resolveFabActions([
      action('log'),
      action('delete'),
      action('edit'),
    ])

    expect(keys(secondaryActions)).toEqual(['edit', 'delete'])
  })

  it('has nothing to fan out for a lone action', () => {
    const { primary, secondaryActions } = resolveFabActions([action('new')])

    expect(primary.key).toBe('new')
    expect(secondaryActions).toEqual([])
  })

  it('loses no action along the way', () => {
    const { secondaryActions } = resolveFabActions([
      action('a'),
      action('b'),
      action('c'),
    ])

    expect(secondaryActions).toHaveLength(2)
  })

  it('leaves the caller’s array untouched', () => {
    const actions = [action('log'), action('delete'), action('edit')]

    resolveFabActions(actions)

    expect(keys(actions)).toEqual(['log', 'delete', 'edit'])
  })

  // The two halves of one contract: the provider reverses for the desktop
  // dial, the mobile sheet reverses back. Round-tripping must land on the
  // order the page actually authored.
  it('round-trips through the mobile sheet to authoring order', () => {
    const authored = [action('log'), action('delete'), action('edit')]
    const { primary, secondaryActions } = resolveFabActions(authored)

    expect(keys(sheetActionOrder(primary, secondaryActions))).toEqual(
      keys(authored)
    )
  })
})

// Action arrays are rebuilt every render with fresh onClick closures, so the
// array reference is useless as an effect dependency — it would re-register
// and re-render every FAB consumer on every render of the calling page.
describe('actionsSignature', () => {
  it('is stable across rebuilds of the same action set', () => {
    const build = () => [action('log'), action('edit')]

    expect(actionsSignature(build())).toBe(actionsSignature(build()))
  })

  // Closure identity is exactly what it must NOT catch.
  it('ignores a changed onClick closure', () => {
    const a = [action('log', { onClick: () => 1 })]
    const b = [action('log', { onClick: () => 2 })]

    expect(actionsSignature(a)).toBe(actionsSignature(b))
  })

  it('ignores a changed label', () => {
    expect(actionsSignature([action('log', { label: 'Log a run' })])).toBe(
      actionsSignature([action('log', { label: 'Log' })])
    )
  })

  describe('what it does catch', () => {
    it('a different action', () => {
      expect(actionsSignature([action('log')])).not.toBe(
        actionsSignature([action('edit')])
      )
    })

    it('an added action', () => {
      expect(actionsSignature([action('log')])).not.toBe(
        actionsSignature([action('log'), action('edit')])
      )
    })

    it('a reordered set', () => {
      expect(actionsSignature([action('log'), action('edit')])).not.toBe(
        actionsSignature([action('edit'), action('log')])
      )
    })

    // A disabled action renders greyed rather than being dropped, so its
    // enablement flipping has to re-register.
    it('an action becoming disabled', () => {
      expect(actionsSignature([action('log', { disabled: true })])).not.toBe(
        actionsSignature([action('log', { disabled: false })])
      )
    })

    it('an action becoming dangerous', () => {
      expect(actionsSignature([action('del', { danger: true })])).not.toBe(
        actionsSignature([action('del')])
      )
    })
  })

  // Null means "this page registers nothing", which is distinct from an
  // empty set and must not collide with any real signature.
  it('reports no signature for no override', () => {
    expect(actionsSignature(null)).toBeNull()
  })

  it('distinguishes no override from an empty one', () => {
    expect(actionsSignature([])).not.toBe(actionsSignature(null))
  })
})
