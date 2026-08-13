import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TwoPlayerPicker } from '../TwoPlayerPicker'
import { renderWithProviders } from '@/utils/testUtils'

const partnerField = () => screen.queryByPlaceholderText(/Partner's name/)

function render(props: Partial<Parameters<typeof TwoPlayerPicker>[0]> = {}) {
  return renderWithProviders(
    <TwoPlayerPicker
      solo={null}
      partner=""
      onSoloChange={vi.fn()}
      onPartnerChange={vi.fn()}
      {...props}
    />
  )
}

describe('TwoPlayerPicker', () => {
  it('preselects neither option while the question is unanswered', () => {
    render({ solo: null })

    for (const name of ['Beat it solo', 'With a partner']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute(
        'aria-pressed',
        'false'
      )
    }
  })

  it('hides the partner field until the user says they had a partner', () => {
    const { unmount } = render({ solo: null })
    expect(partnerField()).not.toBeInTheDocument()
    unmount()

    const { unmount: unmount2 } = render({ solo: true })
    expect(partnerField()).not.toBeInTheDocument()
    unmount2()

    render({ solo: false })
    expect(partnerField()).toBeInTheDocument()
  })

  it('reports solo as a boolean, not the option value', async () => {
    const onSoloChange = vi.fn()
    render({ onSoloChange })

    await userEvent.click(screen.getByRole('button', { name: 'Beat it solo' }))
    expect(onSoloChange).toHaveBeenCalledWith(true)

    await userEvent.click(
      screen.getByRole('button', { name: 'With a partner' })
    )
    expect(onSoloChange).toHaveBeenCalledWith(false)
  })

  it('reports the whole next value, not the typed character', async () => {
    const onPartnerChange = vi.fn()
    render({ solo: false, partner: 'Rio', onPartnerChange })

    await userEvent.type(partnerField()!, 't')

    expect(onPartnerChange).toHaveBeenCalledWith('Riot')
  })

  it('ties a caller-supplied label to the partner input', () => {
    render({
      solo: false,
      partnerInputId: 'partner-1',
      partnerLabel: <label htmlFor="partner-1">Partner</label>,
    })

    expect(screen.getByLabelText('Partner')).toBe(partnerField())
  })
})
