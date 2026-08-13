import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompletionReviewStep } from '../CompletionReviewStep'
import { useLoggingFlow } from '../../LoggingFlowProvider'
import { emptyDraft, type FlowDraft } from '../../types'
import { useMe } from '@/lib/api/me'
import {
  useLogCompletion,
  type CompletionInput,
  type LogResult,
} from '@/lib/api/logging'
import { toast } from '@/components/generic/sonner'
import { ApiError } from '@/lib/api/client'
import {
  makeCachedLevel,
  makeMe,
  renderWithProviders,
  stubLoggingFlow,
  stubMutation,
  stubQuery,
} from '@/utils/testUtils'

// Boundaries only: the flow context the step reads, the two lib/api hooks, and
// the toast channel. `buildCompletionInput` and `loggingErrorMessage` stay real
// — what they produce is half of what these assertions claim.
vi.mock('../../LoggingFlowProvider')
vi.mock('@/lib/api/me', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/me')>()),
  useMe: vi.fn(),
}))
vi.mock('@/lib/api/logging', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/logging')>()),
  useLogCompletion: vi.fn(),
}))
vi.mock('@/components/generic/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const level = makeCachedLevel({ inGameId: '4284013', name: 'Bloodbath' })

/** `useLogCompletion`'s result shape, so the mock matches the hook's types. */
const logMutation = (overrides: Parameters<typeof stubMutation>[0] = {}) =>
  stubMutation<LogResult, CompletionInput>(overrides)

/** Mounts the step with the given draft, user, and submit mutation. */
function render({
  draft = {},
  me = makeMe(),
  mutation = logMutation(),
  flow = {},
}: {
  draft?: Partial<FlowDraft>
  me?: ReturnType<typeof makeMe>
  mutation?: ReturnType<typeof logMutation>
  flow?: Parameters<typeof stubLoggingFlow>[0]
} = {}) {
  const value = stubLoggingFlow({
    level,
    draft: { ...emptyDraft(), ...draft },
    ...flow,
  })
  vi.mocked(useLoggingFlow).mockReturnValue(value)
  vi.mocked(useMe).mockReturnValue(stubQuery({ data: me }))
  vi.mocked(useLogCompletion).mockReturnValue(mutation)
  return { ...renderWithProviders(<CompletionReviewStep />), flow: value }
}

/** The value cell beside a summary row's label. */
function rowValue(label: string) {
  return screen.getByText(label).nextElementSibling
}

describe('CompletionReviewStep', () => {
  it('renders nothing until both the level and the user have loaded', () => {
    vi.mocked(useLoggingFlow).mockReturnValue(stubLoggingFlow({ level: null }))
    vi.mocked(useMe).mockReturnValue(stubQuery({ data: makeMe() }))
    vi.mocked(useLogCompletion).mockReturnValue(logMutation())

    const { container } = renderWithProviders(<CompletionReviewStep />)

    expect(container).toBeEmptyDOMElement()
  })

  it('always states the completion, even with nothing else filled in', () => {
    render({ draft: { attempts: '', worstFail: '' } })

    expect(rowValue('Completion')).toHaveTextContent('100%')
  })

  it('folds attempts and best run into the completion line when given', () => {
    render({ draft: { attempts: '4200', worstFail: '97' } })

    expect(rowValue('Completion')).toHaveTextContent(
      '100% · 4,200 attempts · best run 97%'
    )
  })

  it('omits an optional row rather than showing it empty', () => {
    render({
      draft: { date: null, difficultyOpinion: null, enjoyment: null },
    })

    expect(screen.queryByText('Date')).not.toBeInTheDocument()
    expect(screen.queryByText('Your difficulty rating')).not.toBeInTheDocument()
    expect(screen.queryByText('Enjoyment')).not.toBeInTheDocument()
    expect(screen.queryByText('GDDL')).not.toBeInTheDocument()
    expect(screen.queryByText('Session')).not.toBeInTheDocument()
  })

  it('names a demon difficulty opinion plainly', () => {
    render({ draft: { difficultyOpinion: 'EXTREME' } })

    expect(rowValue('Your difficulty rating')).toHaveTextContent('Extreme')
  })

  it('spells out a non-demon opinion with its star count', () => {
    render({ draft: { difficultyOpinion: 'THREE_STAR' } })

    expect(rowValue('Your difficulty rating')).toHaveTextContent(
      /Not demon-worthy · 3★/
    )
  })

  it('marks a weighted rating as weighted, and a simple one not', () => {
    const { unmount } = render({
      me: makeMe({ ratingMode: 'WEIGHTED' }),
      draft: { ratingScores: { a: 80, b: 60 } },
    })
    expect(rowValue('Rating')).toHaveTextContent('(weighted)')
    unmount()

    render({ draft: { simpleRating: 70 } })
    expect(rowValue('Rating')).not.toHaveTextContent('(weighted)')
  })

  it('averages the category scores for a weighted rating', () => {
    render({
      me: makeMe({ ratingMode: 'WEIGHTED' }),
      draft: { ratingScores: { a: 80, b: 60 } },
    })

    // 70 internal → 7.0 on the 0–10 display scale.
    expect(rowValue('Rating')).toHaveTextContent('7')
  })

  it('collects the session details into one line', () => {
    render({
      draft: {
        fps: '240',
        onStream: true,
        videoUrl: 'https://youtu.be/x',
        visibility: 'PRIVATE',
      },
    })

    expect(rowValue('Session')).toHaveTextContent(
      '240 FPS · on stream · video attached · private'
    )
  })

  it('goes back to the list-references step', async () => {
    const { flow } = render()

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(flow.setStep).toHaveBeenCalledWith('c_listrefs')
  })

  it('routes to the GDDL step after logging when a key is connected', async () => {
    const mutateAsync = vi
      .fn()
      .mockResolvedValue({ levelProgress: { id: 'lp-1' } })
    const { flow } = render({
      me: makeMe({ hasGddlApiKey: true }),
      mutation: logMutation({ mutateAsync }),
    })

    await userEvent.click(
      screen.getByRole('button', { name: 'Log completion' })
    )

    expect(flow.setLastCompletion).toHaveBeenCalledWith('lp-1')
    expect(flow.setStep).toHaveBeenCalledWith('c_gddl')
  })

  it('skips straight to success when no GDDL key is connected', async () => {
    const mutateAsync = vi
      .fn()
      .mockResolvedValue({ levelProgress: { id: 'lp-1' } })
    const { flow } = render({
      me: makeMe({ hasGddlApiKey: false }),
      mutation: logMutation({ mutateAsync }),
    })

    await userEvent.click(
      screen.getByRole('button', { name: 'Log completion' })
    )

    expect(flow.setStep).toHaveBeenCalledWith('c_success')
  })

  it('keeps the user on the step and toasts when the write fails', async () => {
    const mutateAsync = vi
      .fn()
      .mockRejectedValue(new ApiError(500, 'Server exploded'))
    const { flow } = render({ mutation: logMutation({ mutateAsync }) })

    await userEvent.click(
      screen.getByRole('button', { name: 'Log completion' })
    )

    expect(toast.error).toHaveBeenCalled()
    expect(flow.setStep).not.toHaveBeenCalled()
  })

  it('blocks a second submit while the first is in flight', () => {
    render({ mutation: logMutation({ isPending: true }) })

    expect(screen.getByRole('button', { name: 'Logging…' })).toBeDisabled()
  })
})
