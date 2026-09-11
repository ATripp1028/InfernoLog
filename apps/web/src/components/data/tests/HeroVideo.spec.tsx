import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useMe, type MeData } from '@/lib/api/me'
import { makeMe, stubQuery } from '@/utils/testUtils'
import { HeroVideo } from '../HeroVideo'

vi.mock('@/lib/api/me', () => ({ useMe: vi.fn() }))

const YT = 'https://youtu.be/6v_pWirR72Q'
const CLIP = 'https://clips.twitch.tv/SomeFunnyClipName'

function consent(youtubeEmbedConsent: boolean) {
  vi.mocked(useMe).mockReturnValue(
    stubQuery<MeData>({ data: makeMe({ youtubeEmbedConsent }) })
  )
}

beforeEach(() => {
  consent(true)
})

describe('HeroVideo', () => {
  // The element has no intrinsic height. Without a default box a caller passing
  // only cosmetic classes collapses it to nothing, which looks exactly like a
  // video that failed to load and reports no error anywhere.
  it.each([
    ['YouTube’s player', YT],
    ['the click-to-load facade', CLIP],
  ])('sizes %s to a 16:9 box when the caller passes no box', (_label, url) => {
    const { container } = render(
      <HeroVideo url={url} className="rounded-card" />
    )

    expect(container.firstElementChild).toHaveClass('aspect-video', 'w-full')
  })

  it('keeps the caller’s own classes alongside its box', () => {
    const { container } = render(
      <HeroVideo url={YT} className="rounded-card" />
    )

    expect(container.firstElementChild).toHaveClass('rounded-card')
  })

  it('loads YouTube’s own player with the page once the viewer allows it', () => {
    render(<HeroVideo url={YT} label="Showcase" />)

    expect(screen.getByTitle('Showcase')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/6v_pWirR72Q'
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('keeps YouTube behind the facade until the viewer allows it', () => {
    consent(false)

    render(<HeroVideo url={YT} />)

    expect(
      screen.getByRole('button', { name: 'Play completion video' })
    ).toBeInTheDocument()
    expect(screen.queryByTitle('Completion video')).not.toBeInTheDocument()
  })

  it('names a facade from the label, for the poster and its control', () => {
    render(<HeroVideo url={CLIP} label="Showcase" />)

    expect(screen.getByText('Showcase')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Play showcase' })
    ).toBeInTheDocument()
  })

  it('defaults the label to the completion video it was written for', () => {
    render(<HeroVideo url={YT} />)

    expect(screen.getByTitle('Completion video')).toBeInTheDocument()
  })
})
