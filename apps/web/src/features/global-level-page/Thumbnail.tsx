import { useState } from 'react'
import { cn } from '@/lib/utils'
import { levelThumbnailUrl, levelThumbnailPlaceholder } from '@/lib/gdAssets'

interface ThumbnailProps {
  levelId: string
  levelName: string
  /**
   * Delisted levels are frozen and have no live thumbnail to fetch — go
   * straight to the placeholder rather than attempting (and failing) the
   * network request.
   */
  forcePlaceholder?: boolean
  className?: string
}

/**
 * The page's hero image (NOT a backdrop) — the community thumbnail at a fixed
 * 16:9 box, falling back to the local placeholder on 404/error without shifting
 * layout. Deliberately no dark scrim: that treatment is for the logging modal's
 * background, a different job. Keeps the small levelthumbs attribution chip
 * (Apache-2.0, hotlinking permitted within rate limits).
 */
export function Thumbnail({
  levelId,
  levelName,
  forcePlaceholder = false,
  className,
}: ThumbnailProps) {
  const [failed, setFailed] = useState(false)
  const showPlaceholder = forcePlaceholder || failed
  const src = showPlaceholder
    ? levelThumbnailPlaceholder
    : levelThumbnailUrl(levelId)

  return (
    <div
      className={cn(
        'relative aspect-video w-full overflow-hidden bg-bg-surface',
        className
      )}
    >
      <img
        src={src}
        alt={showPlaceholder ? '' : `${levelName} thumbnail`}
        aria-hidden={showPlaceholder || undefined}
        className="size-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  )
}
