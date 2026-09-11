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
 * YouTube's poster sizes, best first. Not every video has every size:
 * `maxresdefault` exists only for uploads YouTube processed in HD, and
 * `sddefault` is missing on some older ones. `hqdefault` exists for any video
 * YouTube has processed at all, so it is the last resort.
 */
const YOUTUBE_POSTER_SIZES = ['maxresdefault', 'sddefault', 'hqdefault'] as const

/**
 * Poster image URLs for a YouTube video, in the order to try them.
 */
export function youTubePosterUrls(videoId: string): string[] {
  return YOUTUBE_POSTER_SIZES.map(
    (size) => `https://img.youtube.com/vi/${videoId}/${size}.jpg`
  )
}

/**
 * Whether a loaded poster is YouTube's stand-in for a size the video lacks.
 *
 * YouTube answers a missing size with a 404 whose body is a valid 120×90 grey
 * JPEG. Browsers decode it and fire `load`, never `error`, so width is the only
 * tell. It is unambiguous: none of the sizes in {@link youTubePosterUrls} is
 * genuinely 120px wide.
 */
export function isYouTubePlaceholder(naturalWidth: number): boolean {
  return naturalWidth === 120
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
