import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { RESERVED_COLLECTION_NAMES } from '@infernolog/core'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { MobileSheetDialog } from '@/components/MobileSheetDialog'
import {
  collectionErrorCode,
  useCollections,
  type CollectionDetail,
} from '@/lib/api/collections'

interface CollectionFormDialogProps {
  open: boolean
  onClose: () => void
  // Resolves when the save succeeds; rejects with the ApiError otherwise.
  onSave: (input: {
    name: string
    description: string | null
  }) => Promise<unknown>
  isSaving: boolean
  // Edit mode: seed with the collection being edited (its own name is
  // excluded from the duplicate check so rename-to-same is allowed).
  editing?: CollectionDetail | undefined
}

const isReserved = (name: string) =>
  (RESERVED_COLLECTION_NAMES as readonly string[]).some(
    (r) => r.toLowerCase() === name.trim().toLowerCase()
  )

/**
 * Create / edit collection modal (mocks 1174:3 create, 1255:2 validation).
 * Name + optional description; duplicate and reserved-name violations render
 * inline under a red Name input with the primary action disabled. Validation
 * runs client-side against the cached index, and the same server codes
 * (DUPLICATE_NAME / RESERVED_NAME) are mapped back if a race slips through.
 */
export function CollectionFormDialog({
  open,
  onClose,
  onSave,
  isSaving,
  editing,
}: CollectionFormDialogProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const collections = useCollections()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '')
      setDescription(editing?.description ?? '')
      setServerError(null)
    }
  }, [open, editing])

  const trimmed = name.trim()
  const clientError = useMemo(() => {
    if (!trimmed) return null
    if (isReserved(trimmed)) {
      return `“${trimmed}” is a built-in collection name — choose another.`
    }
    const clash = (collections.data ?? []).some(
      (c) =>
        c.id !== editing?.id &&
        c.name.trim().toLowerCase() === trimmed.toLowerCase()
    )
    if (clash) return `You already have a collection named “${trimmed}”.`
    return null
  }, [trimmed, collections.data, editing?.id])

  const error = clientError ?? serverError
  const canSave = !!trimmed && !clientError && !isSaving

  if (!open) return null

  async function handleSave() {
    if (!canSave) return
    setServerError(null)
    try {
      await onSave({ name: trimmed, description: description.trim() || null })
    } catch (err) {
      const code = collectionErrorCode(err)
      if (code === 'DUPLICATE_NAME') {
        setServerError(`You already have a collection named “${trimmed}”.`)
      } else if (code === 'RESERVED_NAME') {
        setServerError(
          `“${trimmed}” is a built-in collection name — choose another.`
        )
      } else {
        setServerError('Something went wrong. Try again.')
      }
    }
  }

  const header = (
    <div className="flex items-center justify-between pb-2 pl-6 pr-5 pt-5">
      <h2 className="text-lg font-semibold text-text-primary">
        {editing ? 'Edit collection' : 'New collection'}
      </h2>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex size-7 items-center justify-center rounded-md text-text-secondary hover:bg-bg-subtle hover:text-text-primary"
      >
        <X size={16} />
      </button>
    </div>
  )

  const body = (
    <div className="flex flex-col gap-5 px-6 pb-5 pt-3">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="collection-name"
          className="text-[13px] font-medium text-text-secondary"
        >
          Name
        </label>
        <div className="relative">
          <input
            id="collection-name"
            autoFocus={isDesktop}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setServerError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSave()
            }}
            maxLength={50}
            className={cn(
              'h-11 w-full rounded-btn border bg-bg-base px-3 pr-9 text-sm text-text-primary outline-none placeholder:text-text-tertiary',
              error
                ? 'border-[1.5px] border-danger'
                : 'border-border focus:border-primary'
            )}
          />
          {error && (
            <AlertTriangle
              size={16}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-danger"
            />
          )}
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <label
            htmlFor="collection-description"
            className="text-[13px] font-medium text-text-secondary"
          >
            Description
          </label>
          <span className="text-[11px] text-text-tertiary">Optional</span>
        </div>
        <Textarea
          id="collection-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          rows={3}
          placeholder="What's this collection for?"
          className="resize-none"
        />
      </div>
    </div>
  )

  const footer = (
    <div
      className={cn(
        'flex items-center justify-end gap-3 border-t border-border-subtle bg-bg-surface/50 px-6 py-3.5',
        isDesktop && 'rounded-b-xl'
      )}
    >
      <Button variant="outline" onClick={onClose}>
        Cancel
      </Button>
      <Button onClick={() => void handleSave()} disabled={!canSave}>
        {isSaving ? 'Saving…' : editing ? 'Save changes' : 'Create collection'}
      </Button>
    </div>
  )

  if (isDesktop) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="w-full max-w-[480px] rounded-xl border border-border bg-bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
          {header}
          {body}
          {footer}
        </div>
      </div>
    )
  }

  return (
    <MobileSheetDialog
      onClose={onClose}
      className="border-border bg-bg-surface"
    >
      <div className="overflow-y-auto">
        {header}
        {body}
      </div>
      {footer}
    </MobileSheetDialog>
  )
}
