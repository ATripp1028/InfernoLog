// Index card for one collection: identity strip (glyph badge + thumbnail
// cluster), name row with the Built-in tag, and the level count. Matches the
// Collections index mocks (desktop 1168:2 / mobile 1215:2).

import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import type { CollectionSummary } from '@/lib/api/collections'
import { levelThumbnailUrl } from '@/lib/gdAssets'
import { collectionIdentity, isBuiltIn, withAlpha } from './identity'

export function CollectionCard({
  collection,
}: {
  collection: CollectionSummary
}) {
  const identity = collectionIdentity(collection.type, collection.id)
  const Icon = identity.icon
  const count = collection.entryCount

  return (
    <Link
      to="/collections/$collectionId"
      params={{ collectionId: collection.id }}
      className="group overflow-hidden rounded-card border border-border bg-bg-surface transition-colors hover:border-border-subtle hover:bg-bg-elevated"
    >
      <div
        className="flex h-24 items-center justify-between p-4"
        style={{ backgroundColor: withAlpha(identity.color, 0.14) }}
      >
        <span
          className="flex size-11 items-center justify-center rounded-[10px]"
          style={{ backgroundColor: withAlpha(identity.color, 0.9) }}
        >
          <Icon size={22} className="text-bg-base" strokeWidth={2.5} />
        </span>
        <ThumbCluster levelIds={collection.previewLevelIds} />
      </div>
      <div className="flex flex-col gap-1.5 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-base font-semibold text-text-primary">
            {collection.name}
          </span>
          {isBuiltIn(collection.type) && (
            <span className="shrink-0 text-[11px] font-medium text-text-tertiary">
              Built-in
            </span>
          )}
        </div>
        <span className="text-[13px] text-text-secondary">
          {count} {count === 1 ? 'level' : 'levels'}
        </span>
      </div>
    </Link>
  )
}

// Up to four overlapping level thumbnails, newest-in-collection on the left.
// An empty collection shows a single dashed placeholder frame (mock 1250:41).
function ThumbCluster({ levelIds }: { levelIds: string[] }) {
  if (levelIds.length === 0) {
    return (
      <span className="h-14 w-[120px]">
        <span className="ml-auto mt-2 block h-10 w-[52px] rounded border-2 border-dashed border-border" />
      </span>
    )
  }
  return (
    <span className="relative block h-14 w-[120px]">
      {levelIds.slice(0, 4).map((levelId, i) => (
        <img
          key={levelId}
          src={levelThumbnailUrl(levelId)}
          alt=""
          aria-hidden
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden'
          }}
          className="absolute h-10 w-[52px] rounded border-2 border-bg-base bg-bg-elevated object-cover"
          style={{
            left: 80 - i * 22,
            top: i % 2 === 0 ? 8 : 12,
            zIndex: 4 - i,
          }}
        />
      ))}
    </span>
  )
}

// The dashed "New collection" card at the end of the customs grid.
export function CreateCollectionCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[188px] flex-col items-center justify-center gap-2.5 rounded-card border-2 border-dashed border-border bg-bg-surface/40 text-text-secondary transition-colors hover:border-border-subtle hover:text-text-primary"
    >
      <Plus size={28} />
      <span className="text-sm font-medium">New collection</span>
    </button>
  )
}
