import { levelThumbnailUrl } from '@/lib/gdAssets'

// The level thumbnail as a row background with a dark left→right scrim so the
// content above stays legible — the same treatment the list page uses for its
// rows (see features/list/RowWash). The base surface fill keeps the row opaque
// when a thumbnail 404s (the <img> hides itself on error).
export function ThumbnailWash({ levelId }: { levelId: string }) {
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0 bg-[var(--color-bg-surface)]"
      />
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
        style={{
          background:
            'linear-gradient(90deg, rgba(13,13,13,0.92) 0%, rgba(13,13,13,0.7) 55%, rgba(13,13,13,0.85) 100%)',
        }}
      />
    </>
  )
}
