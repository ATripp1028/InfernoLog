// Thin wrapper: resolves the Want to Beat collection from the collections
// cache and delegates to AddLevelsDialog. The seeded-confirmation and
// LEVEL_ALREADY_COMPLETED error handling live there.

import { Loader2 } from 'lucide-react'
import { useCollections } from '@/lib/api/collections'
import type { CollectionDetail } from '@/lib/api/collections'
import { AddLevelsDialog } from './AddLevelsDialog'

interface AddToWantToBeatDialogProps {
  open: boolean
  onClose: () => void
}

export function AddToWantToBeatDialog({ open, onClose }: AddToWantToBeatDialogProps) {
  const collections = useCollections()

  if (!open) return null

  const wtb = collections.data?.find((c) => c.type === 'WANT_TO_BEAT')

  if (!wtb) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55">
        <Loader2 size={32} className="animate-spin text-text-secondary" />
      </div>
    )
  }

  // Construct a minimal CollectionDetail. entries is empty — "already added"
  // badges won't show, but the API handles duplicates gracefully.
  const collection: CollectionDetail = {
    id: wtb.id,
    name: wtb.name,
    type: wtb.type,
    description: wtb.description,
    createdAt: wtb.createdAt,
    entries: [],
  }

  return <AddLevelsDialog open={open} onClose={onClose} collection={collection} />
}
