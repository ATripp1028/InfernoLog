import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorFallback } from '../ErrorFallback'
import { renderWithProviders } from '@/utils/testUtils'

// jsdom's location is not writable, and the fallback's whole job is to
// navigate. `unstubGlobals` in vitest.config.ts unwinds this after each test.
const reload = vi.fn()
const assign = vi.fn()

vi.mock('@/lib/cacheOwner', () => ({
  releaseCacheOwner: vi.fn(() => Promise.resolve()),
}))
const { releaseCacheOwner } = await import('@/lib/cacheOwner')

beforeEach(() => {
  vi.stubGlobal('location', { reload, assign, href: 'http://localhost/list' })
})

describe('ErrorFallback', () => {
  it('announces itself to assistive tech rather than rendering a silent panel', () => {
    renderWithProviders(<ErrorFallback />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('reloads the current page', async () => {
    renderWithProviders(<ErrorFallback />)

    await userEvent.click(screen.getByRole('button', { name: 'Reload page' }))

    expect(reload).toHaveBeenCalledOnce()
  })

  it('leaves via window.location, not the router', async () => {
    // The router is a plausible cause of the error being displayed, so the
    // escape route must not go through it.
    renderWithProviders(<ErrorFallback />)

    await userEvent.click(screen.getByRole('button', { name: 'Go home' }))

    expect(assign).toHaveBeenCalledWith('/')
  })

  it('drops the persisted cache before reloading', async () => {
    // The persisted cache is restored synchronously at mount, so a poisoned
    // one reproduces the crash on every reload. Clearing it is the only exit.
    renderWithProviders(<ErrorFallback />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Clear saved data and reload' })
    )

    expect(releaseCacheOwner).toHaveBeenCalledOnce()
    await waitFor(() => expect(reload).toHaveBeenCalledOnce())
  })

  it('reloads even when clearing the cache rejects', async () => {
    // Storage being broken is exactly what the user is trying to escape;
    // leaving them on a disabled button would be the worst outcome.
    vi.mocked(releaseCacheOwner).mockRejectedValueOnce(new Error('nope'))
    renderWithProviders(<ErrorFallback />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Clear saved data and reload' })
    )

    await waitFor(() => expect(reload).toHaveBeenCalledOnce())
  })

  it('shows the Sentry event id so a bug report can quote it', () => {
    renderWithProviders(<ErrorFallback eventId="abc123" />)

    expect(screen.getByText('abc123')).toBeInTheDocument()
  })

  it('omits the error id line when the event was never reported', () => {
    renderWithProviders(<ErrorFallback />)

    expect(screen.queryByText(/Error ID:/)).not.toBeInTheDocument()
  })
})
