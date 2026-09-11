import { useState, type KeyboardEvent } from 'react'
import { useMe } from '@/lib/api/me'
import { resolveEmbed, type VideoSource } from './videoEmbed'

const SOURCE_LABELS: Record<VideoSource, string> = {
  youtube: '▶ youtube.com',
  'twitch-clip': '📡 twitch.tv',
  unknown: '▶ video',
}

/**
 * State for HeroVideo: the player a URL resolves to, and the click-to-load
 * facade in front of any player that doesn't load with the page.
 *
 * Whether YouTube's may load with the page is the viewer's consent, read from
 * `me`. Until `me` has loaded, that counts as no, so nothing reaches YouTube
 * on a guess.
 *
 * Pressing play is remembered against the URL it was pressed for. A page that
 * stays mounted while moving between levels hands HeroVideo a new URL rather
 * than a new instance, and the next video should start at its facade, not
 * autoplay.
 *
 * @returns `player`, the iframe src to render now (`null` while the facade is
 * up); the facade's `sourceLabel` chip; and its click and key handlers.
 */
export function useHeroVideo(url: string) {
  const me = useMe()
  const embed = resolveEmbed(
    url,
    location.hostname,
    me.data?.youtubeEmbedConsent ?? false
  )
  const [playingUrl, setPlayingUrl] = useState<string | null>(null)

  const play = () => {
    if (embed.src) setPlayingUrl(url)
  }

  return {
    player:
      embed.src && (embed.loadsWithPage || playingUrl === url)
        ? embed.src
        : null,
    sourceLabel: SOURCE_LABELS[embed.source],
    play,
    onKeyDown: (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && embed.src) {
        e.preventDefault()
        play()
      }
    },
  }
}
