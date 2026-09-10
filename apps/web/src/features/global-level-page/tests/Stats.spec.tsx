import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
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
            aredlEnjoyment: 59.39285714,
            aredlEnjoymentPending: false,
          })}
        />
      )

      expect(screen.getByText('Enjoyment')).toBeInTheDocument()
      expect(screen.getByText('59.4')).toBeInTheDocument()
      expect(screen.queryByText('Pending')).toBeNull()
    })

    it('marks a provisional score as pending', () => {
      render(
        <Stats
          level={makeGlobalLevel({
            aredlEnjoyment: 63.3,
            aredlEnjoymentPending: true,
          })}
        />
      )

      expect(screen.getByText('Pending')).toBeInTheDocument()
    })

    // AREDL covers ~1600 levels, so the card is absent far more often than not.
    // An empty card would imply the level has a score of nothing.
    it('renders no card at all when AREDL has no score', () => {
      render(<Stats level={makeGlobalLevel({ aredlEnjoyment: null })} />)

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
  })
})
