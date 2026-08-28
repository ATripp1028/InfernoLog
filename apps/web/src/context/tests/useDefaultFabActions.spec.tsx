import { act, render as renderTree, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { FabAction } from '@/context/FabActionsContext'
import { LOGGING_ACTIONS } from '@/features/logging/loggingActions'

// The two dialogs are rendered by this hook, not driven by it — stub them to
// trivial markers so the spec is about the action set and the open state it
// hands them, rather than their internals.
vi.mock('@/context/LoggingFlowContext', () => ({ useLoggingFlow: vi.fn() }))
vi.mock('@/features/collections/AddToWantToBeatDialog', () => ({
  AddToWantToBeatDialog: (props: { open: boolean }) => (
    <div data-testid="wtb" data-open={String(props.open)} />
  ),
}))
vi.mock('@/features/collections/AddToCollectionDialog', () => ({
  AddToCollectionDialog: (props: { open: boolean }) => (
    <div data-testid="collection" data-open={String(props.open)} />
  ),
}))

const { useLoggingFlow } = await import('@/context/LoggingFlowContext')
const { useDefaultFabActions } = await import('../useDefaultFabActions')

let open: ReturnType<typeof vi.fn>

beforeEach(() => {
  open = vi.fn()
  vi.mocked(useLoggingFlow).mockReturnValue({ open } as never)
})

const renderHookUnderTest = () => renderHook(() => useDefaultFabActions())

const action = (result: { actions: FabAction[] }, key: string) =>
  result.actions.find((a) => a.key === key)!

/** Renders the returned dialog tree and reads one stub's open state. */
function dialogOpen(dialogs: ReactNode, testId: string): string {
  const { container } = renderTree(<>{dialogs}</>)
  return (
    container
      .querySelector(`[data-testid="${testId}"]`)
      ?.getAttribute('data-open') ?? 'missing'
  )
}

describe('useDefaultFabActions', () => {
  it('offers every declared logging action, in order', () => {
    const { result } = renderHookUnderTest()

    expect(result.current.actions.map((a) => a.key)).toEqual(
      LOGGING_ACTIONS.map((a) => a.key)
    )
  })

  it('carries each action’s label and icon through', () => {
    const { result } = renderHookUnderTest()

    for (const [i, a] of result.current.actions.entries()) {
      expect(a.label).toBe(LOGGING_ACTIONS[i]!.label)
      expect(a.icon).toBe(LOGGING_ACTIONS[i]!.icon)
    }
  })

  it.each(['completion', 'progress', 'drop'] as const)(
    'opens the logging flow on the %s path',
    (path) => {
      const { result } = renderHookUnderTest()

      act(() => action(result.current, path).onClick())

      expect(open).toHaveBeenCalledWith(path)
    }
  )

  // The two collection actions open dialogs instead of the flow.
  it.each(['want-to-beat', 'add-to-list'])(
    'does not open the flow from %s',
    (key) => {
      const { result } = renderHookUnderTest()

      act(() => action(result.current, key).onClick())

      expect(open).not.toHaveBeenCalled()
    }
  )

  it('starts with both dialogs closed', () => {
    const { result } = renderHookUnderTest()

    expect(dialogOpen(result.current.dialogs, 'wtb')).toBe('false')
    expect(dialogOpen(result.current.dialogs, 'collection')).toBe('false')
  })

  it.each([
    ['want-to-beat', 'wtb'],
    ['add-to-list', 'collection'],
  ])('opens the %s dialog', (key, testId) => {
    const { result } = renderHookUnderTest()

    act(() => action(result.current, key).onClick())

    expect(dialogOpen(result.current.dialogs, testId)).toBe('true')
  })

  it('leaves the other dialog closed', () => {
    const { result } = renderHookUnderTest()

    act(() => action(result.current, 'want-to-beat').onClick())

    expect(dialogOpen(result.current.dialogs, 'collection')).toBe('false')
  })

  // The dialog state belongs to the hook instance, not a module-level store —
  // `FabActionsProvider` is the only caller today, but a second one must not
  // inherit the first's open dialog.
  it('gives each caller independent dialog state', () => {
    const first = renderHookUnderTest()
    const second = renderHookUnderTest()

    act(() => action(first.result.current, 'want-to-beat').onClick())

    expect(dialogOpen(first.result.current.dialogs, 'wtb')).toBe('true')
    expect(dialogOpen(second.result.current.dialogs, 'wtb')).toBe('false')
  })
})
