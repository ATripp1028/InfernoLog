import { useState } from 'react'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'

function extractYouTubeId(url: string): string | null {
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

function extractTwitchClipSlug(url: string): string | null {
  const m = url.match(/clips\.twitch\.tv\/([A-Za-z0-9_-]+)/)
  return m?.[1] ?? null
}

type VideoSource = 'youtube' | 'twitch-clip' | 'unknown'

function detectSource(url: string): VideoSource {
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube'
  if (/twitch\.tv/.test(url)) return 'twitch-clip'
  return 'unknown'
}

// Poster falls back from maxres → hq when maxres 404s (some older videos).
function YouTubePoster({ videoId }: { videoId: string }) {
  const [src, setSrc] = useState(
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  )
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      className="absolute inset-0 size-full object-cover opacity-60"
      onError={() =>
        setSrc(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`)
      }
    />
  )
}

/**
 * The completion video embed at the top of the level page, or the thumbnail when there is none.
 */
export function HeroVideo({
  url,
  className,
}: {
  url: string
  className?: string
}) {
  const [playing, setPlaying] = useState(false)

  const source = detectSource(url)
  const youtubeId = source === 'youtube' ? extractYouTubeId(url) : null
  const twitchSlug =
    source === 'twitch-clip' ? extractTwitchClipSlug(url) : null

  const iframeSrc = youtubeId
    ? `https://www.youtube.com/embed/${youtubeId}?autoplay=1`
    : twitchSlug
      ? `https://clips.twitch.tv/embed?clip=${twitchSlug}&parent=${location.hostname}&autoplay=true`
      : null

  const sourceLabel =
    source === 'youtube'
      ? '▶ youtube.com'
      : source === 'twitch-clip'
        ? '📡 twitch.tv'
        : '▶ video'

  if (playing && iframeSrc) {
    return (
      <div className={cn('overflow-hidden bg-black', className)}>
        <iframe
          src={iframeSrc}
          title="Completion video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="size-full border-0"
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group relative cursor-pointer overflow-hidden bg-black',
        className
      )}
      onClick={() => iframeSrc && setPlaying(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && iframeSrc) {
          e.preventDefault()
          setPlaying(true)
        }
      }}
      aria-label="Play completion video"
    >
      {youtubeId && <YouTubePoster videoId={youtubeId} />}

      {/* Dark scrim — fixed opacity per DESIGN_LANGUAGE.md */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Play button + label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <div className="flex size-[58px] items-center justify-center rounded-fab bg-primary shadow-[0_4px_16px_rgba(232,57,14,0.4)] transition-transform group-hover:scale-105 md:size-[68px]">
          <Play
            size={22}
            fill="white"
            stroke="none"
            className="ml-1 md:size-[26px]"
          />
        </div>
        <span className="text-xs text-text-body md:text-sm">
          Completion video
        </span>
      </div>

      {/* Source chip */}
      <div className="absolute bottom-3 right-3 rounded bg-black/50 px-2 py-0.5 text-[10px] text-white/75">
        {sourceLabel}
      </div>
    </div>
  )
}
