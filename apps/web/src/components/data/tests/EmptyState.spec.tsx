import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { EmptyState } from '../EmptyState'
import { renderWithProviders } from '@/utils/testUtils'

describe('EmptyState', () => {
  it('renders the title alone when that is all it is given', () => {
    renderWithProviders(<EmptyState title="No levels yet" />)

    expect(screen.getByText('No levels yet')).toBeInTheDocument()
  })

  it('omits the description and action rather than leaving empty slots', () => {
    const { container } = renderWithProviders(<EmptyState title="Nothing" />)

    // Title only — a stray empty <p> or wrapper would show up as a sibling.
    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(container.querySelectorAll('div')).toHaveLength(1)
  })

  it('renders a description when given one', () => {
    renderWithProviders(
      <EmptyState title="No levels yet" description="Log one from the FAB." />
    )

    expect(screen.getByText('Log one from the FAB.')).toBeInTheDocument()
  })

  it('renders an action when there is an obvious next step', () => {
    renderWithProviders(
      <EmptyState title="No collections" action={<button>Create one</button>} />
    )

    expect(
      screen.getByRole('button', { name: 'Create one' })
    ).toBeInTheDocument()
  })
})
