/**
 * The glossary sheet has two content rules, and neither is visible from
 * reading the component: no event type may be named, and the internal-only
 * index renormalisation must not appear at all — not in any spelling, and not
 * described in prose. The user neither did it nor saw it.
 */

import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/utils/testUtils'
import { GlossarySheet } from '../GlossarySheet'

function renderSheet() {
  return renderWithProviders(<GlossarySheet open onOpenChange={() => {}} />)
}

describe('GlossarySheet', () => {
  it('explains each kind of entry in the user’s own words', () => {
    renderSheet()
    expect(screen.getByText('What the log shows')).toBeInTheDocument()
    expect(screen.getByText('Beat a level')).toBeInTheDocument()
    expect(screen.getByText('Placed')).toBeInTheDocument()
    expect(screen.getByText('Edited a log')).toBeInTheDocument()
    expect(screen.getByText('Changed your rating setup')).toBeInTheDocument()
  })

  it('names no event type', () => {
    const { container } = renderSheet()
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

  it('does not mention the rebalance in any form', () => {
    const { container } = renderSheet()
    const text = (container.textContent ?? '').toLowerCase()
    expect(text).not.toContain('rebalance')
    expect(text).not.toContain('renormal')
    expect(text).not.toContain('index')
  })

  it('says collections are not tracked, rather than leaving a silent hole', () => {
    renderSheet()
    expect(screen.getByText(/Collections aren’t tracked/i)).toBeInTheDocument()
  })
})
