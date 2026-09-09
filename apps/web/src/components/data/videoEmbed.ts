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
