import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { FabAction } from '../FabActionsContext'

const { defaultActions } = vi.hoisted(() => ({
  defaultActions: { current: [] as unknown[] },
}))

vi.mock('@/features/logging/useDefaultFabActions', () => ({
  useDefaultFabActions: () => ({
    actions: defaultActions.current,
    dialogs: null,
  }),
}))

const { FabActionsProvider, useFabActions, useResolvedFabActions } =
  await import('../FabActionsContext')

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

const wrapper = ({ children }: { children: ReactNode }) => (
  <FabActionsProvider>{children}</FabActionsProvider>
)

const keys = (actions: readonly FabAction[]) => actions.map((a) => a.key)

beforeEach(() => {
  defaultActions.current = [action('log'), action('want'), action('collect')]
})

describe('the resolved FAB actions', () => {
  it('falls back to the default action set', () => {
    const { result } = renderHook(() => useResolvedFabActions(), { wrapper })

    expect(result.current.primary.key).toBe('log')
  })

  it('fans the default set out farthest-first', () => {
    const { result } = renderHook(() => useResolvedFabActions(), { wrapper })

    expect(keys(result.current.secondaryActions)).toEqual(['collect', 'want'])
  })

  it('carries no sheet header by default', () => {
    const { result } = renderHook(() => useResolvedFabActions(), { wrapper })

    expect(result.current.sheetHeader).toBeNull()
  })
})

describe('a page registering its own actions', () => {
  /** Mounts a page's override alongside a reader of the resolved set. */
  function renderWithOverride(
    actions: FabAction[] | null,
    header?: string | null
  ) {
    return renderHook(
      (props: { actions: FabAction[] | null; header?: string | null }) => {
        useFabActions(props.actions, props.header)
        return useResolvedFabActions()
      },
      { wrapper, initialProps: { actions, ...(header ? { header } : {}) } }
    )
  }

  it('replaces the default set', () => {
    const { result } = renderWithOverride([action('edit'), action('delete')])

    expect(result.current.primary.key).toBe('edit')
    expect(keys(result.current.secondaryActions)).toEqual(['delete'])
  })

  it('sets the mobile sheet header', () => {
    const { result } = renderWithOverride([action('edit')], 'Bloodbath')

    expect(result.current.sheetHeader).toBe('Bloodbath')
  })

  // Passing null is how a page falls back deliberately — e.g. the level page
  // when the current user does not own the level being viewed.
  it('falls back to the defaults when it registers null', () => {
    const { result } = renderWithOverride(null)

    expect(result.current.primary.key).toBe('log')
  })

  // A header without an action set of its own would label the default
  // actions with a page's name.
  it('drops the header when falling back', () => {
    const { result } = renderWithOverride(null, 'Bloodbath')

    expect(result.current.sheetHeader).toBeNull()
  })

  it('restores the defaults once the page unmounts', () => {
    const { result, unmount } = renderHook(
      () => {
        useFabActions([action('edit')])
        return useResolvedFabActions()
      },
      { wrapper }
    )
    expect(result.current.primary.key).toBe('edit')

    unmount()

    // The reader unmounted with it, so assert on a fresh mount instead.
    const after = renderHook(() => useResolvedFabActions(), { wrapper })
    expect(after.result.current.primary.key).toBe('log')
  })

  it('follows a page that swaps its action set', () => {
    const { result, rerender } = renderWithOverride([action('edit')])

    rerender({ actions: [action('publish')] })

    expect(result.current.primary.key).toBe('publish')
  })

  // The signature is what makes registration cheap — a page re-rendering
  // with fresh closures must not churn the provider. An unstable signature
  // re-registers on every render, which sets provider state, which
  // re-renders the page: a loop that hangs rather than fails, so the precise
  // statement of this contract lives in fabActionResolution.spec.ts.
  it('keeps the same actions across a re-render with fresh closures', () => {
    const { result, rerender } = renderHook(
      ({ n }: { n: number }) => {
        useFabActions([action('edit', { onClick: () => n })])
        return useResolvedFabActions()
      },
      { wrapper, initialProps: { n: 1 } }
    )
    const before = result.current.primary

    rerender({ n: 2 })

    expect(result.current.primary.key).toBe(before.key)
  })
})

describe('using the FAB actions outside a provider', () => {
  // A silent no-op would leave the FAB stuck on the default actions with no
  // hint as to why.
  it('throws rather than silently doing nothing', () => {
    expect(() => renderHook(() => useResolvedFabActions())).toThrow(
      /within FabActionsProvider/
    )
  })
})
