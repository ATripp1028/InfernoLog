import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeGlobalLevel } from '@/utils/testUtils'
import { Stats } from '../Stats'

describe('Stats', () => {
  describe('the Length card', () => {
    it('leads with the duration and keeps the band underneath', () => {
      render(
        <Stats level={makeGlobalLevel({ durationSeconds: 121, length: 'Long' })} />
      )

      expect(screen.getByText('2:01')).toBeInTheDocument()
      expect(screen.getByText('Long')).toBeInTheDocument()
    })

    // Every level has RobTop's band; almost none had a duration before this,
    // and none will if all three sources are unreachable.
    it('falls back to the band when no source has timed the level', () => {
      render(
        <Stats level={makeGlobalLevel({ durationSeconds: null, length: 'XL' })} />
      )

      expect(screen.getByText('XL')).toBeInTheDocument()
    })

    it('shows a dash when neither is known', () => {
      render(
        <Stats level={makeGlobalLevel({ durationSeconds: null, length: null })} />
      )

      expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    })
  })

  describe('the Enjoyment card', () => {
    it('shows the score to two decimals, as EDEL does', () => {
      render(
        <Stats
          level={makeGlobalLevel({
            partialDiff: 'demon-extreme',
            enjoyment: 59.39,
          })}
        />
      )

      expect(screen.getByText('Enjoyment')).toBeInTheDocument()
      expect(screen.getByText('59.39')).toBeInTheDocument()
    })

    // GDDL's score covers the levels EDEL doesn't rate, on the same 0-100.
    it('shows GDDL’s score for a non-extreme', () => {
      render(
        <Stats
          level={makeGlobalLevel({
            partialDiff: 'demon-insane',
            enjoyment: 50,
          })}
        />
      )

      expect(screen.getByText('50')).toBeInTheDocument()
    })

    // The API stores nothing for an extreme EDEL hasn't rated — GDDL is not a
    // fallback there — so the card simply has no value to show.
    it('renders no card for an extreme EDEL has not rated', () => {
      render(
        <Stats
          level={makeGlobalLevel({
            partialDiff: 'demon-extreme',
            enjoyment: null,
          })}
        />
      )

      expect(screen.queryByText('Enjoyment')).toBeNull()
    })

    it('renders no card at all when the level has no score', () => {
      render(<Stats level={makeGlobalLevel({ enjoyment: null })} />)

      expect(screen.queryByText('Enjoyment')).toBeNull()
    })

    // "Enjoyment" alone reads as the viewer's own rating, which is a different
    // number they may also have on this level.
    it('explains whose rating it is', () => {
      render(<Stats level={makeGlobalLevel({ enjoyment: 50 })} />)

      expect(
        screen.getByRole('button', {
          name: 'Where does the enjoyment rating come from?',
        })
      ).toBeInTheDocument()
    })

    // The two sources are on one scale but are not one measurement, so the
    // explanation has to name the one actually being shown.
    it.each([
      [
        'EDEL',
        { partialDiff: 'demon-extreme', enjoyment: 50 },
        /Extreme Demon Enjoyment List/,
      ],
      [
        'GDDL',
        { partialDiff: 'demon-insane', enjoyment: 50 },
        /GDDL/,
      ],
    ])('names %s as the source in its popover', async (_label, props, matcher) => {
      const user = userEvent.setup()
      render(<Stats level={makeGlobalLevel(props)} />)

      await user.click(
        screen.getByRole('button', {
          name: 'Where does the enjoyment rating come from?',
        })
      )

      expect(screen.getByText(matcher)).toBeInTheDocument()
    })
  })
})
