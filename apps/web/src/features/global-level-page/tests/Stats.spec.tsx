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
    it('shows the AREDL score to one decimal', () => {
      render(
        <Stats
          level={makeGlobalLevel({
            partialDiff: 'demon-extreme',
            aredlEnjoyment: 59.39285714,
            aredlEnjoymentPending: false,
          })}
        />
      )

      expect(screen.getByText('Enjoyment')).toBeInTheDocument()
      expect(screen.getByText('59.4')).toBeInTheDocument()
      expect(screen.queryByText('Pending')).toBeNull()
    })

    // GDDL's score covers the levels EDEL doesn't rate, on the same 0-100.
    it('shows GDDL’s score for a non-extreme', () => {
      render(
        <Stats
          level={makeGlobalLevel({
            partialDiff: 'demon-insane',
            aredlEnjoyment: null,
            gddlEnjoyment: 50,
          })}
        />
      )

      expect(screen.getByText('50.0')).toBeInTheDocument()
    })

    it('renders no card for an extreme EDEL has not rated', () => {
      render(
        <Stats
          level={makeGlobalLevel({
            partialDiff: 'demon-extreme',
            aredlEnjoyment: null,
            gddlEnjoyment: 50,
          })}
        />
      )

      expect(screen.queryByText('Enjoyment')).toBeNull()
    })

    it('marks a provisional score as pending', () => {
      render(
        <Stats
          level={makeGlobalLevel({
            partialDiff: 'demon-extreme',
            aredlEnjoyment: 63.3,
            aredlEnjoymentPending: true,
          })}
        />
      )

      expect(screen.getByText('Pending')).toBeInTheDocument()
    })

    // Only EDEL publishes a provisional flag, so a GDDL score must never carry
    // the marker even though both render through the same card.
    it('never marks a GDDL score as pending', () => {
      render(
        <Stats
          level={makeGlobalLevel({
            partialDiff: 'demon-insane',
            aredlEnjoyment: null,
            aredlEnjoymentPending: true,
            gddlEnjoyment: 50,
          })}
        />
      )

      expect(screen.queryByText('Pending')).toBeNull()
    })

    it('renders no card at all when neither source has a score', () => {
      render(
        <Stats
          level={makeGlobalLevel({ aredlEnjoyment: null, gddlEnjoyment: null })}
        />
      )

      expect(screen.queryByText('Enjoyment')).toBeNull()
    })

    // "Enjoyment" alone reads as the viewer's own rating, which is a different
    // number they may also have on this level.
    it('explains whose rating it is', () => {
      render(<Stats level={makeGlobalLevel({ aredlEnjoyment: 50 })} />)

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
        { partialDiff: 'demon-extreme', aredlEnjoyment: 50 },
        /Extreme Demon Enjoyment List/,
      ],
      [
        'GDDL',
        { partialDiff: 'demon-insane', aredlEnjoyment: null, gddlEnjoyment: 50 },
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
