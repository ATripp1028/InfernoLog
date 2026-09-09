import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HeroVideo } from '../HeroVideo'

const YT = 'https://youtu.be/6v_pWirR72Q'

describe('HeroVideo', () => {
  // The element has no intrinsic height. Without a default box a caller passing
  // only cosmetic classes collapses it to nothing, which looks exactly like a
  // video that failed to load and reports no error anywhere.
  it('sizes itself to a 16:9 box when the caller passes no box', () => {
    const { container } = render(
      <HeroVideo url={YT} className="rounded-card" />
    )

    expect(container.firstElementChild).toHaveClass('aspect-video', 'w-full')
  })

  it('keeps the caller’s own classes alongside its box', () => {
    const { container } = render(
      <HeroVideo url={YT} className="rounded-card" />
    )

    expect(container.firstElementChild).toHaveClass('rounded-card')
  })

  it('names the video from the label, for the poster and its control', () => {
    render(<HeroVideo url={YT} label="Showcase" />)

    expect(screen.getByText('Showcase')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Play showcase' })
    ).toBeInTheDocument()
  })

  it('defaults the label to the completion video it was written for', () => {
    render(<HeroVideo url={YT} />)

    expect(screen.getByText('Completion video')).toBeInTheDocument()
  })
})
