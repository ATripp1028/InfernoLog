import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHeroVideo } from './useHeroVideo'

/**
 * A video embed sitting where a level page's hero image would.
 *
 * A YouTube video gets YouTube's own player straight away once the viewer has
 * allowed it (YouTubeEmbedConsentField), showing its poster, title and channel
 * and playing on the first tap. Until then it sits behind a click-to-load
 * facade (our play button over a dark scrim), and nothing loads from YouTube
 * until that is pressed. The facade costs mobile viewers a second tap, since
 * the tap that loads an embedded player isn't allowed to start it too, and
 * that tap is what consenting buys back. A Twitch clip always sits behind the
 * facade. So does a URL with no embeddable id, whose button does nothing.
 *
 * Shared by both level pages, which show different videos in that slot — the
 * viewer's own completion run on their page, the level's showcase on the
 * global one — so `label` names whichever this is.
 *
 * Sizes itself to a 16:9 box by default. That default is load-bearing rather
 * than cosmetic: the element has no intrinsic height, so a caller passing only
 * cosmetic classes used to collapse it to nothing — visibly "the video didn't
 * load" with no error anywhere. A caller wanting a different box still wins,
 * since an explicit height makes the aspect ratio moot.
 *
 * @param url - Any YouTube or Twitch-clip URL.
 * @param label - What the video is: the player's accessible name, and on the
 * facade the text under the play button.
 */
export function HeroVideo({
  url,
  label = 'Completion video',
  className,
}: {
  url: string
  label?: string
  className?: string
}) {
  const { player, sourceLabel, play, onKeyDown } = useHeroVideo(url)

  if (player) {
    return (
      <div
        className={cn(
          'aspect-video w-full overflow-hidden bg-black',
          className
        )}
      >
        {/* YouTube refuses to play (error 153) without a Referer, so the
          iframe states the policy rather than inheriting whatever the page
          is served with. */}
        <iframe
          src={player}
          title={label}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          className="size-full border-0"
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group relative aspect-video w-full cursor-pointer overflow-hidden bg-black',
        className
      )}
      onClick={play}
      role="button"
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label={`Play ${label.toLowerCase()}`}
    >
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
        <span className="text-xs text-text-body md:text-sm">{label}</span>
      </div>

      {/* Source chip */}
      <div className="absolute bottom-3 right-3 rounded bg-black/50 px-2 py-0.5 text-[10px] text-white/75">
        {sourceLabel}
      </div>
    </div>
  )
}
