/**
 * The glossary sheet has two content rules, and neither is visible from
 * reading the component: no event type may be named, and the internal-only
 * index renormalisation must not appear at all — not in any spelling, and not
 * described in prose. The user neither did it nor saw it.
 */

import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/utils/testUtils'
import { GlossarySheet } from '../GlossarySheet'

// The component owns its own open state — that is what keeps opening it from
// re-rendering the feed behind it — so the spec opens it the way a user does.
async function renderSheet() {
  const result = renderWithProviders(<GlossarySheet />)
  await userEvent.click(
    screen.getByRole('button', { name: /what the log shows/i })
  )
  return result
}

describe('GlossarySheet', () => {
  it('explains each kind of entry in the user’s own words', async () => {
    await renderSheet()
    // The button and the sheet's own heading share this wording, so match the
    // heading specifically rather than the text.
    expect(
      screen.getByRole('heading', { name: 'What the log shows' })
    ).toBeInTheDocument()
    expect(screen.getByText('Beat a level')).toBeInTheDocument()
    expect(screen.getByText('Placed')).toBeInTheDocument()
    expect(screen.getByText('Edited a log')).toBeInTheDocument()
    expect(screen.getByText('Changed your rating setup')).toBeInTheDocument()
  })

  it('names no event type', async () => {
    const { container } = await renderSheet()
    const text = container.textContent ?? ''
    for (const eventType of [
      'RANKING_PLACEMENT',
      'RANKING_REORDER',
      'RANKING_UNRANKED',
      'RANKING_BULK_REPLACE',
      'LOG_EDIT',
      'RATING_CONFIG_CHANGE',
    ]) {
      expect(text).not.toContain(eventType)
    }
  })

  it('does not mention the rebalance in any form', async () => {
    const { container } = await renderSheet()
    const text = (container.textContent ?? '').toLowerCase()
    expect(text).not.toContain('rebalance')
    expect(text).not.toContain('renormal')
    expect(text).not.toContain('index')
  })

  it('says collections are not tracked, rather than leaving a silent hole', async () => {
    await renderSheet()
    expect(screen.getByText(/Collections aren’t tracked/i)).toBeInTheDocument()
  })

  it('stays shut until asked', () => {
    renderWithProviders(<GlossarySheet />)
    expect(screen.queryByText('Beat a level')).not.toBeInTheDocument()
  })
})
