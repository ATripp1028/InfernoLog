import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompletionRatingStep } from '../CompletionRatingStep'
import { useLoggingFlow } from '@/context/LoggingFlowContext'
import { emptyDraft, type FlowDraft } from '../../types'
import { useMe } from '@/lib/api/me'
import {
  makeCachedLevel,
  makeMe,
  renderWithProviders,
  stubLoggingFlow,
  stubQuery,
} from '@/utils/testUtils'

// Boundaries only: the flow context and `useMe`. `toDisplay`/`toInternal` and
// `computeWeightedAvg` stay real — the unit conversion at this component's
// edge is most of what these assertions are claiming.
vi.mock('@/context/LoggingFlowContext')
vi.mock('@/lib/api/me', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/me')>()),
  useMe: vi.fn(),
}))

const level = makeCachedLevel({ inGameId: '14', name: 'Clubstep' })

const CATEGORIES = [
  { id: 'cat-gameplay', name: 'Gameplay', weight: 0.5, sortOrder: 0 },
  { id: 'cat-decoration', name: 'Decoration', weight: 0.5, sortOrder: 1 },
]

/** Mounts the step with the given draft and user. */
function render({
  draft = {},
  me = makeMe(),
}: {
  draft?: Partial<FlowDraft>
  me?: ReturnType<typeof makeMe>
} = {}) {
  const value = stubLoggingFlow({
    level,
    step: 'c_rating',
    draft: { ...emptyDraft(), ...draft },
  })
  vi.mocked(useLoggingFlow).mockReturnValue(value)
  vi.mocked(useMe).mockReturnValue(stubQuery({ data: me }))
  return { ...renderWithProviders(<CompletionRatingStep />), flow: value }
}

// StepperInput is a free-form text field, not `<input type="number">`, so it
// has no spinbutton role — it is reached by the aria-label it takes from the
// row. It also commits on blur rather than per keystroke, which is why every
// edit below ends in `user.tab()`.
//
// Displayed values are `toFixed(precision)`: one decimal on the 0–10 scale,
// none on 0–100. So internal 70 reads "7.0", not "7".
/** The stepper field for a rating row, reached by the row's own label. */
function stepper(label: string) {
  return screen.getByLabelText(label)
}

/** Types into a stepper and blurs, which is what commits the value. */
async function setStepper(
  user: ReturnType<typeof userEvent.setup>,
  field: HTMLElement,
  value: string
) {
  await user.clear(field)
  await user.type(field, value)
  await user.tab()
}

describe('CompletionRatingStep', () => {
  // The step renders at all. Worth its own case because the way this component
  // broke once was a wrapper that rendered itself instead of the shared
  // RatingRow — infinite recursion, which typechecks and lints clean and takes
  // the whole tab out with an out-of-memory crash at runtime. Any render
  // catches it; there was no render.
  it('renders both rating controls', () => {
    render()

    expect(screen.getByText('Enjoyment')).toBeInTheDocument()
    expect(screen.getByText('Rating')).toBeInTheDocument()
    expect(screen.getAllByRole('slider')).toHaveLength(2)
  })

  describe('unit conversion', () => {
    // Draft values are internal 0–100; the controls speak display units. This
    // boundary is the reason the wrapper exists at all.
    it('shows internal values in display units on the 0–10 scale', () => {
      render({ draft: { enjoyment: 85, simpleRating: 70 } })

      expect(stepper('Enjoyment Score')).toHaveValue('8.5')
      expect(stepper('Rating Score')).toHaveValue('7.0')
    })

    it('leaves values unconverted on the 0–100 scale', () => {
      render({
        draft: { enjoyment: 85 },
        me: makeMe({ ratingDisplayScale: 'ZERO_TO_HUNDRED' }),
      })

      expect(stepper('Enjoyment Score')).toHaveValue('85')
    })

    it('patches the draft back in internal units', async () => {
      const user = userEvent.setup()
      const { flow } = render()

      await setStepper(user, stepper('Enjoyment Score'), '7.5')

      expect(flow.patchDraft).toHaveBeenCalledWith({ enjoyment: 75 })
    })

    // `null` is "not rated yet", which the control shows as 0 without the
    // draft claiming the user chose 0.
    it('defaults to 50 for all scores', () => {
      const { flow } = render({ draft: { enjoyment: null, simpleRating: null } })

      expect(flow.patchDraft).toHaveBeenCalledWith({ enjoyment: 50 })
      expect(flow.patchDraft).toHaveBeenCalledWith({ simpleRating: 50 })
    })
  })

  describe('weighted mode', () => {
    it('renders one row per category instead of a single score', () => {
      render({
        me: makeMe({ ratingMode: 'WEIGHTED', ratingCategories: CATEGORIES }),
      })

      expect(stepper('Gameplay')).toBeTruthy()
      expect(stepper('Decoration')).toBeTruthy()
      expect(screen.getByText('Rating · weighted')).toBeInTheDocument()
    })

    it('shows the weighted average in display units', () => {
      render({
        draft: { ratingScores: { 'cat-gameplay': 80, 'cat-decoration': 60 } },
        me: makeMe({ ratingMode: 'WEIGHTED', ratingCategories: CATEGORIES }),
      })

      // 80 and 60 at even weights → 70 internal → 7 on the 0–10 scale.
      expect(screen.getByText(/weighted avg/)).toHaveTextContent('7')
    })

    it('patches one category without dropping the others', async () => {
      const user = userEvent.setup()
      const { flow } = render({
        draft: { ratingScores: { 'cat-decoration': 60 } },
        me: makeMe({ ratingMode: 'WEIGHTED', ratingCategories: CATEGORIES }),
      })

      await setStepper(user, stepper('Gameplay'), '9')

      expect(flow.patchDraft).toHaveBeenCalledWith({
        ratingScores: { 'cat-decoration': 60, 'cat-gameplay': 90 },
      })
    })

    it('explains the empty state when no categories are configured', () => {
      render({ me: makeMe({ ratingMode: 'WEIGHTED', ratingCategories: [] }) })

      expect(
        screen.getByText(/No rating categories configured/)
      ).toBeInTheDocument()
    })
  })

  describe('navigation', () => {
    it('steps backward and forward', async () => {
      const user = userEvent.setup()
      const { flow } = render()

      const footer = screen.getByRole('button', { name: 'Back' })
      await user.click(footer)
      expect(flow.setStep).toHaveBeenCalledWith('c_basics')

      await user.click(screen.getByRole('button', { name: 'Continue' }))
      expect(flow.setStep).toHaveBeenCalledWith('c_session')
    })
  })
})
