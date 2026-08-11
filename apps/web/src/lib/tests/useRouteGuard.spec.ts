import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

const { useRouteGuard } = await import('../useRouteGuard')

const render = (props: { ready: boolean; when: boolean; to?: string }) =>
  renderHook(
    (p: { ready: boolean; when: boolean; to?: string }) =>
      useRouteGuard({
        ready: p.ready,
        when: p.when,
        to: (p.to ?? '/') as never,
      }),
    { initialProps: props }
  )

describe('useRouteGuard', () => {
  // Before the async state resolves, `when` is meaningless and must not be
  // trusted either way.
  describe('before the condition is known', () => {
    it('redirects nowhere', () => {
      render({ ready: false, when: true })

      expect(navigate).not.toHaveBeenCalled()
    })

    // Rendering the page here is what causes the one-frame flash the hook
    // exists to prevent.
    it('holds the page back', () => {
      expect(render({ ready: false, when: true }).result.current).toBe(true)
      expect(render({ ready: false, when: false }).result.current).toBe(true)
    })
  })

  describe('once the condition holds', () => {
    it('redirects', () => {
      render({ ready: true, when: true, to: '/onboarding' })

      expect(navigate).toHaveBeenCalledWith({
        to: '/onboarding',
        replace: true,
      })
    })

    // Replaces so the guarded page does not sit in history for the back
    // button to land on again.
    it('replaces rather than pushing', () => {
      render({ ready: true, when: true })

      expect(navigate.mock.calls[0]![0]).toMatchObject({ replace: true })
    })

    // Redirecting but still rendering is the half-right version this hook
    // was written to stop.
    it('still holds the page back while the redirect lands', () => {
      expect(render({ ready: true, when: true }).result.current).toBe(true)
    })
  })

  describe('once the condition is known not to hold', () => {
    it('redirects nowhere', () => {
      render({ ready: true, when: false })

      expect(navigate).not.toHaveBeenCalled()
    })

    it('lets the page render', () => {
      expect(render({ ready: true, when: false }).result.current).toBe(false)
    })
  })

  // The common shape: an auth check resolves, and only then does the answer
  // become actionable.
  it('redirects when the async state resolves against the visitor', () => {
    const { rerender } = render({ ready: false, when: true })

    rerender({ ready: true, when: true })

    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('releases the page when the async state resolves in their favour', () => {
    const { result, rerender } = render({ ready: false, when: true })

    rerender({ ready: true, when: false })

    expect(result.current).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })

  // A re-render must not fire a second navigation for the same decision.
  it('redirects once, not on every render', () => {
    const { rerender } = render({ ready: true, when: true })

    rerender({ ready: true, when: true })
    rerender({ ready: true, when: true })

    expect(navigate).toHaveBeenCalledTimes(1)
  })
})
