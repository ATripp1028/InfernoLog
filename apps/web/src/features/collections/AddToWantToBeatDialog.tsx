import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { useCollection, useCollections } from '@/lib/api/collections'
import type { CollectionDetail } from '@/lib/api/collections'
import { useMyProgress } from '@/lib/api/list'
import { AddLevelsDialog } from './AddLevelsDialog'

interface AddToWantToBeatDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Thin wrapper: resolves the Want to Beat collection from the collections
 * cache and delegates to AddLevelsDialog. The seeded-confirmation and
 * LEVEL_ALREADY_COMPLETED error handling live there.
 */
export function AddToWantToBeatDialog({
  open,
  onClose,
}: AddToWantToBeatDialogProps) {
  const collections = useCollections()
  const list = useMyProgress()

  // Resolve WTB id before calling useCollection so the hook is always called
  // unconditionally. Guards in useCollection handle the empty-string case.
  const wtb = collections.data?.find((c) => c.type === 'WANT_TO_BEAT')
  const wtbDetail = useCollection(wtb?.id ?? '')

  const completedIds = useMemo(
    () =>
      new Set(
        list.data
          ?.filter((i) => i.status === 'COMPLETED')
          .map((i) => i.level.inGameId) ?? []
      ),
    [list.data]
  )

  if (!open) return null

  if (!wtb) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55">
        <Loader2 size={32} className="animate-spin text-text-secondary" />
      </div>
    )
  }

  // Use real collection detail so "Already added" badges show in results.
  // Fall back to empty entries while the detail is still loading.
  const collection: CollectionDetail = wtbDetail.data ?? {
    id: wtb.id,
    name: wtb.name,
    type: wtb.type,
    description: wtb.description,
    createdAt: wtb.createdAt,
    entries: [],
  }

  return (
    <AddLevelsDialog
      open={open}
      onClose={onClose}
      collection={collection}
      completedIds={completedIds}
    />
  )
}
