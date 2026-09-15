import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const { navigate, auth } = vi.hoisted(() => ({
  navigate: vi.fn(),
  auth: { isAuthenticated: false, isAuthInitializing: true },
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }))

const { useSignedOutRoute } = await import('../useSignedOutRoute')

beforeEach(() => {
  navigate.mockReset()
  auth.isAuthenticated = false
  auth.isAuthInitializing = true
})

describe('useSignedOutRoute', () => {
  it('blocks while auth is still initializing', () => {
    const { result } = renderHook(() => useSignedOutRoute())
    expect(result.current).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('renders the page for a visitor signed out on arrival', async () => {
    auth.isAuthInitializing = false
    const { result } = renderHook(() => useSignedOutRoute())
    await waitFor(() => expect(result.current).toBe(false))
    expect(navigate).not.toHaveBeenCalled()
  })

  it('sends a visitor signed in on arrival to their log', async () => {
    auth.isAuthInitializing = false
    auth.isAuthenticated = true
    renderHook(() => useSignedOutRoute())
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: '/log', replace: true })
    )
  })

  // The page signs the visitor in itself partway through a flow; reacting to
  // that would pull them to /log before the flow routed them.
  it('ignores a sign-in that happens after arrival', async () => {
    auth.isAuthInitializing = false
    const { result, rerender } = renderHook(() => useSignedOutRoute())
    await waitFor(() => expect(result.current).toBe(false))

    auth.isAuthenticated = true
    rerender()

    expect(result.current).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })
})
