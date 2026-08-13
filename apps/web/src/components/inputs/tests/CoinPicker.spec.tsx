import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CoinPicker, type CoinPickerLevel } from '../CoinPicker'
import { renderWithProviders } from '@/utils/testUtils'

function level(overrides: Partial<CoinPickerLevel> = {}): CoinPickerLevel {
  return { coins: 3, coinsVerified: true, creator: 'Someone', ...overrides }
}

/** The toggle buttons, in coin order. */
const coins = () => screen.getAllByRole('button')

describe('CoinPicker', () => {
  it('renders one toggle per coin the level has', () => {
    renderWithProviders(
      <CoinPicker
        level={level({ coins: 2 })}
        collected={0}
        onChange={vi.fn()}
      />
    )

    expect(coins()).toHaveLength(2)
  })

  it('renders nothing when the level has no coins', () => {
    const { container } = renderWithProviders(
      <CoinPicker
        level={level({ coins: 0 })}
        collected={0}
        onChange={vi.fn()}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the coin count is unknown', () => {
    const { container } = renderWithProviders(
      <CoinPicker
        level={level({ coins: null })}
        collected={0}
        onChange={vi.fn()}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('marks exactly the coins set in the bitmask as collected', () => {
    // 0b101 — coins 1 and 3, not 2.
    renderWithProviders(
      <CoinPicker level={level()} collected={0b101} onChange={vi.fn()} />
    )

    expect(coins().map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'true',
    ])
  })

  it('reports the whole new bitmask when a coin is toggled on', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <CoinPicker level={level()} collected={0b001} onChange={onChange} />
    )

    await userEvent.click(coins()[1]!)

    // The second coin added to the existing first, not replacing it.
    expect(onChange).toHaveBeenCalledWith(0b011)
  })

  it('reports the whole new bitmask when a coin is toggled off', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <CoinPicker level={level()} collected={0b011} onChange={onChange} />
    )

    await userEvent.click(coins()[0]!)

    expect(onChange).toHaveBeenCalledWith(0b010)
  })

  it('labels each coin with its number and collected state', () => {
    renderWithProviders(
      <CoinPicker
        level={level({ coins: 2 })}
        collected={0b01}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Coin 1 (collected)')).toBeInTheDocument()
    expect(screen.getByLabelText('Coin 2 (not collected)')).toBeInTheDocument()
  })

  it('uses the gold official sprite for a RobTop level and silver otherwise', () => {
    const { container: official } = renderWithProviders(
      <CoinPicker
        level={level({ creator: 'RobTop' })}
        collected={0b001}
        onChange={vi.fn()}
      />
    )
    const officialSrc = official.querySelector('img')!.getAttribute('src')

    const { container: user } = renderWithProviders(
      <CoinPicker level={level()} collected={0b001} onChange={vi.fn()} />
    )
    const userSrc = user.querySelector('img')!.getAttribute('src')

    // Asserting they differ, not what either URL is — the paths are an asset
    // detail, the official-vs-user choice is the decision this component makes.
    expect(officialSrc).not.toEqual(userSrc)
  })
})
