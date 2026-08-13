import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UsernameEditor } from '../UsernameEditor'
import {
  checkUsernameAvailable,
  useUpdateUsername,
  type MeData,
} from '@/lib/api/me'
import { ApiError } from '@/lib/api/client'
import { COOLDOWN_DAYS } from '../../usernameRules'
import {
  makeMe,
  renderWithProviders,
  stubMutation,
} from '@/utils/testUtils'

// `usernameError` and `cooldownEnd` stay real — the rules they encode are half
// of what these assertions claim. Only the two network calls are stubbed.
vi.mock('@/lib/api/me', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/me')>()),
  useUpdateUsername: vi.fn(),
  checkUsernameAvailable: vi.fn(),
}))
vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const DAY = 24 * 60 * 60 * 1000

/** `useUpdateUsername`'s result shape, so the mock matches the hook's types. */
const updateMutation = (overrides: Parameters<typeof stubMutation>[0] = {}) =>
  stubMutation<MeData, string>(overrides)

/**
 * @param availability - What the debounced check resolves to. Set here rather
 * than in the test body, since the check fires on the first keystroke.
 */
function render(
  props: Partial<Parameters<typeof UsernameEditor>[0]> = {},
  mutation = updateMutation(),
  availability: Awaited<ReturnType<typeof checkUsernameAvailable>> = {
    available: true,
  }
) {
  vi.mocked(useUpdateUsername).mockReturnValue(mutation)
  vi.mocked(checkUsernameAvailable).mockResolvedValue(availability)
  return renderWithProviders(
    <UsernameEditor me={makeMe({ username: 'someone' })} {...props} />
  )
}

const TAKEN = { available: false, error: 'Username is already taken' }

const field = () => screen.getByRole('textbox')
const saveButton = () => screen.getByRole('button', { name: /Save/ })

/** Replaces the field's contents, which is what every edit here does. */
async function retype(value: string) {
  await userEvent.clear(field())
  if (value) await userEvent.type(field(), value)
}

describe('UsernameEditor', () => {
  describe('while the rename cooldown is active', () => {
    const locked = makeMe({
      username: 'someone',
      usernameChangedAt: new Date(Date.now() - 5 * DAY).toISOString(),
    })

    it('shows the name with no way to edit it', () => {
      render({ me: locked })

      expect(screen.getByText('someone')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('says when the name can be changed again', () => {
      render({ me: locked })

      expect(
        screen.getByText(/You can change your username again on/)
      ).toBeInTheDocument()
    })

    it('lets a long-expired cooldown through', () => {
      render({
        me: makeMe({
          usernameChangedAt: new Date(
            Date.now() - (COOLDOWN_DAYS + 1) * DAY
          ).toISOString(),
        }),
      })

      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    })
  })

  it('starts collapsed behind an Edit button in settings', () => {
    render()

    expect(screen.getByText('someone')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('opens the field on Edit, prefilled with the current name', async () => {
    render()

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))

    expect(field()).toHaveValue('someone')
  })

  it('starts empty in onboarding, so the seeded placeholder is never shown', async () => {
    // The placeholder embeds part of the user's email address, so it must not
    // be visible even for the moment before they type over it.
    render({
      startInEditing: true,
      me: makeMe({ username: 'alex_9f3a2b' }),
    })

    expect(field()).toHaveValue('')
    expect(screen.queryByText('alex_9f3a2b')).not.toBeInTheDocument()
  })

  it('offers no Cancel in onboarding, which would reveal that placeholder', () => {
    render({ startInEditing: true })

    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('reverts and collapses on Cancel in settings', async () => {
    render()
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await retype('newname')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('someone')).toBeInTheDocument()
  })

  it('cannot save an unchanged name', async () => {
    render({ startInEditing: true, me: makeMe({ username: 'someone' }) })
    await retype('someone')

    expect(saveButton()).toBeDisabled()
  })

  it('rejects an invalid name locally, before asking the server', async () => {
    const mutateAsync = vi.fn()
    render({ startInEditing: true }, updateMutation({ mutateAsync }))
    await retype('a')

    await userEvent.click(saveButton())

    expect(await screen.findByText(/at least 2/i)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('reports a name the server says is taken', async () => {
    render({ startInEditing: true }, updateMutation(), TAKEN)

    await retype('taken')

    expect(
      await screen.findByText('Username is already taken')
    ).toBeInTheDocument()
  })

  it('blocks the save while the name is known to be taken', async () => {
    render({ startInEditing: true }, updateMutation(), TAKEN)
    await retype('taken')
    await screen.findByText('Username is already taken')

    expect(saveButton()).toBeDisabled()
  })

  it('refuses to save a taken name submitted with Enter', async () => {
    // Enter calls handleSave directly, so the disabled Save button is no
    // defence on this path — the availability guard inside handleSave is.
    const mutateAsync = vi.fn()
    render(
      { startInEditing: true },
      updateMutation({ mutateAsync }),
      TAKEN
    )
    await retype('taken')
    await screen.findByText('Username is already taken')

    await userEvent.type(field(), '{Enter}')

    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('does not treat a superseded availability check as a failure', async () => {
    // Each keystroke aborts the previous check; the resulting DOMException is
    // the normal flow while typing, not something to show the user.
    render({ startInEditing: true })
    vi.mocked(checkUsernameAvailable).mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'AbortError' })
    )

    await retype('newname')

    await waitFor(() => expect(checkUsernameAvailable).toHaveBeenCalled())
    expect(screen.queryByText(/aborted/)).not.toBeInTheDocument()
  })

  it('saves the new name and tells the caller', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    const onSaved = vi.fn()
    render({ startInEditing: true, onSaved }, updateMutation({ mutateAsync }))
    await retype('newname')

    await userEvent.click(saveButton())

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('newname'))
    expect(onSaved).toHaveBeenCalled()
  })

  it('explains a cooldown rejection with the date it lifts', async () => {
    const mutateAsync = vi
      .fn()
      .mockRejectedValue(
        new ApiError(403, 'Forbidden', {
          nextAllowedAt: '2026-09-01T00:00:00.000Z',
        })
      )
    render({ startInEditing: true }, updateMutation({ mutateAsync }))
    await retype('newname')

    await userEvent.click(saveButton())

    expect(
      await screen.findByText(/You can change your username again on/)
    ).toBeInTheDocument()
  })

  it('keeps the field open when the save fails', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('Network down'))
    render({ startInEditing: true }, updateMutation({ mutateAsync }))
    await retype('newname')

    await userEvent.click(saveButton())

    expect(await screen.findByText('Network down')).toBeInTheDocument()
    expect(field()).toBeInTheDocument()
  })

  it('locks the field and the buttons while the save is in flight', () => {
    render({ startInEditing: true }, updateMutation({ isPending: true }))

    expect(field()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  })
})
