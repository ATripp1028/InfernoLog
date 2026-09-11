// Recognising the video links a user pastes onto a completion. Pure URL
// inspection — HeroVideo renders whatever these identify.

/**
 * Which service a pasted video URL belongs to. `unknown` renders as a plain outbound link.
 */
export type VideoSource = 'youtube' | 'twitch-clip' | 'unknown'

/**
 * The 11-character video id from any YouTube URL shape — watch links, youtu.be
 * shorteners, Shorts, and embeds.
 *
 * @returns `null` when the URL carries no recognizable id, in which case the
 * caller falls back to a plain link rather than an embed.
 */
export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m?.[1]) return m[1]
  }
  return null
}

/**
 * The clip slug from a clips.twitch.tv URL, or `null`.
 */
export function extractTwitchClipSlug(url: string): string | null {
  const m = url.match(/clips\.twitch\.tv\/([A-Za-z0-9_-]+)/)
  return m?.[1] ?? null
}

/**
 * Which service a URL points at, judged by host alone — a recognized host with
 * an unusable path still reports its source, and the id extractors above
 * decide whether an embed is actually possible.
 */
export function detectSource(url: string): VideoSource {
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube'
  if (/twitch\.tv/.test(url)) return 'twitch-clip'
  return 'unknown'
}

/**
 * The player a video URL embeds as.
 *
 * `src` is `null` when the URL yields no embeddable id. Every `src` is rebuilt
 * from an extracted id, never from the user's URL verbatim, which the CSP's
 * `frame-src` allowlist relies on.
 */
export interface VideoEmbed {
  source: VideoSource
  src: string | null
  /**
   * Whether the player loads as soon as the page does. YouTube's does, so it
   * can show its own poster, title and channel and play on the first tap. A
   * player that doesn't sits behind HeroVideo's click-to-load facade.
   */
  loadsWithPage: boolean
}

/**
 * Resolves a pasted video URL to the player HeroVideo embeds for it.
 *
 * YouTube goes through youtube-nocookie.com, YouTube's privacy-enhanced mode:
 * the same official player, but views of it don't feed the viewer's YouTube
 * history and recommendations.
 *
 * @param hostname - This page's hostname, which Twitch requires as the
 * embed's `parent`.
 */
export function resolveEmbed(url: string, hostname: string): VideoEmbed {
  const source = detectSource(url)
  if (source === 'youtube') {
    const id = extractYouTubeId(url)
    return {
      source,
      src: id ? `https://www.youtube-nocookie.com/embed/${id}` : null,
      loadsWithPage: true,
    }
  }
  if (source === 'twitch-clip') {
    const slug = extractTwitchClipSlug(url)
    return {
      source,
      // Autoplay is safe to ask for: the facade's click is what loads it.
      src: slug
        ? `https://clips.twitch.tv/embed?clip=${slug}&parent=${hostname}&autoplay=true`
        : null,
      loadsWithPage: false,
    }
  }
  return { source, src: null, loadsWithPage: false }
}
