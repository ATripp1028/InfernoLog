import { useMutationBurstNotifier } from '@/hooks/useMutationBurstNotifier'
import { COLLECTION_SAVE_MUTATION_KEYS } from '@/lib/api/collections'

// One "Saved" toast per burst of drag-reorder/remove mutations on a
// collection's entries — see useMutationBurstNotifier for the mechanism.
// Those two are silent on success by design (the row already moves/
// disappears immediately via optimistic updates), so this is the only
// confirmation the backend caught up. Create/update/delete/add-entry
// already show their own per-action toast at the call site and are
// intentionally excluded from this group to avoid double-toasting.
//
// Mount this once at the top of the collection detail page.
export function useCollectionsSaveNotifier() {
  useMutationBurstNotifier(COLLECTION_SAVE_MUTATION_KEYS, 'Saved')
}
