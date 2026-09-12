import { useRef } from 'react'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/generic/button'
import { Input } from '@/components/generic/input'
import { Modal } from '@/components/generic/modal'
import type { CollectionDetail } from '@/lib/api/collections'
import { collectionIdentity, withAlpha } from './identity'
import { useCopyToCollectionDialog } from './useCopyToCollectionDialog'

interface CopyToCollectionDialogProps {
  open: boolean
  onClose: () => void
  /** The collection whose levels are added elsewhere. It is not changed. */
  source: CollectionDetail
}

/**
 * "Add to another collection": pick one other collection and add every level
 * of this one that it doesn't already hold. Each candidate shows how many
 * levels that would be — none greys it out. Logic lives in
 * useCopyToCollectionDialog.
 */
export function CopyToCollectionDialog({
  open,
  onClose,
  source,
}: CopyToCollectionDialogProps) {
  const searchRef = useRef<HTMLInputElement>(null)
  const dialog = useCopyToCollectionDialog({ open, onClose, source })

  const footer = (
    <div className="flex items-center justify-end gap-3">
      <Button
        variant="outline"
        onClick={onClose}
        disabled={dialog.isSubmitting}
      >
        Cancel
      </Button>
      <Button
        onClick={dialog.handleCopy}
        disabled={!dialog.canSubmit}
        className="min-w-[180px] max-w-[320px]"
      >
        <span className="truncate">{dialog.submitLabel}</span>
      </Button>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={dialog.isSubmitting}
      size="xl"
      tall
      divided
      eyebrow={`From ${source.name}`}
      title="Add to another collection"
      subtitle="Adds the levels it doesn't already have. Nothing is removed from either collection."
      autoFocusRef={searchRef}
      footer={footer}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border px-5 py-3">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <Input
              ref={searchRef}
              value={dialog.query}
              onChange={(e) => dialog.setQuery(e.target.value)}
              placeholder="Search collections…"
              aria-label="Search collections"
              className="h-9 pl-8 text-sm"
            />
          </div>
        </div>

        <div
          role="radiogroup"
          aria-label="Collection to add to"
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {dialog.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-text-tertiary" />
            </div>
          ) : dialog.failed ? (
            <p className="px-5 py-10 text-center text-sm text-text-tertiary">
              Couldn&apos;t load your collections. Check your connection and try
              again.
            </p>
          ) : !dialog.hasOthers ? (
            <p className="px-5 py-10 text-center text-sm text-text-tertiary">
              You have no other collections yet.
            </p>
          ) : dialog.targets.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-text-tertiary">
              No collections match &ldquo;{dialog.query}&rdquo;
            </p>
          ) : (
            dialog.targets.map(({ collection, newCount }) => {
              const identity = collectionIdentity(
                collection.type,
                collection.id
              )
              const Icon = identity.icon
              const empty = newCount === 0
              return (
                <label
                  key={collection.id}
                  className={[
                    'flex items-center gap-3 border-b border-border-subtle px-5 py-3 last:border-b-0',
                    empty
                      ? 'cursor-not-allowed opacity-50'
                      : 'cursor-pointer hover:bg-bg-subtle',
                  ].join(' ')}
                >
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-[6px]"
                    style={{ backgroundColor: withAlpha(identity.color, 0.18) }}
                  >
                    <Icon size={14} style={{ color: identity.color }} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                    {collection.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-text-tertiary">
                    {newCount === null ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : empty ? (
                      'Nothing new'
                    ) : (
                      `+${newCount} new`
                    )}
                  </span>
                  <input
                    type="radio"
                    name="copy-target"
                    checked={dialog.targetId === collection.id}
                    disabled={empty}
                    onChange={() => dialog.selectTarget(collection.id)}
                    className="size-4 accent-[var(--color-primary,#e8390e)]"
                  />
                </label>
              )
            })
          )}
        </div>
      </div>
    </Modal>
  )
}
