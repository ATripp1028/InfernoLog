import { levelThumbnailUrl } from '@/lib/gdAssets'

// Left→right scrim variants. `row` is the list-page treatment (heavy, keeps a
// wide row legible). `card` is lighter on the right so a narrow unplaced card
// reveals more of its thumbnail while text on the left stays readable.
const GRADIENTS = {
  row: 'linear-gradient(90deg, rgba(13,13,13,0.92) 0%, rgba(13,13,13,0.7) 55%, rgba(13,13,13,0.85) 100%)',
  card: 'linear-gradient(90deg, rgba(13,13,13,0.92) 0%, rgba(13,13,13,0.72) 45%, rgba(13,13,13,0.4) 100%)',
} as const

/**
 * The level thumbnail as a background with a dark left→right scrim so the
 * content above stays legible — the same treatment the list page uses for its
 * rows (see features/list/RowWash). The base surface fill keeps the element
 * opaque when a thumbnail 404s (the <img> hides itself on error).
 */
export function ThumbnailWash({
  levelId,
  variant = 'row',
}: {
  levelId: string
  variant?: 'row' | 'card'
}) {
  return (
    <>
      <div aria-hidden className="absolute inset-0 bg-bg-surface" />
      <img
        src={levelThumbnailUrl(levelId)}
        alt=""
        aria-hidden
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
        className="absolute inset-0 size-full object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: GRADIENTS[variant] }}
      />
    </>
  )
}
