import { levelThumbnailUrl } from '@/lib/gdAssets'
import type { LogItem } from './types'

/**
 * The level thumbnail as a row background, with a dark left→right overlay so
 * the cells stay legible. Thumbnails 404 for some levels — hide on error.
 */
export function RowWash({ item }: { item: LogItem }) {
  return (
    <>
      <img
        src={levelThumbnailUrl(item.level.inGameId)}
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
