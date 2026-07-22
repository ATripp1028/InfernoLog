// Collections index — built-ins pinned above a labeled "Your collections"
// section of custom collections, plus the dashed create card and the
// create-direct FAB. Mocks: desktop 1168:2, tablet 1214:2, mobile 1215:2.

import { useState } from 'react'
import { toast } from '@/components/ui/sonner'
import { PageLoading } from '@/components/PageLoading'
import { useCollections, useCreateCollection } from '@/lib/api/collections'
import {
  CollectionCard,
  CreateCollectionCard,
} from '@/features/collections/CollectionCard'
import { CollectionFormDialog } from '@/features/collections/CollectionFormDialog'
import { useFabActions } from '@/context/FabActionsContext'
import { Plus } from 'lucide-react'

export function Collections() {
  const collections = useCollections()
  const createCollection = useCreateCollection()
  const [createOpen, setCreateOpen] = useState(false)

  useFabActions([
    {
      key: 'create',
      label: 'New collection',
      icon: Plus,
      onClick: () => setCreateOpen(true),
    },
  ])

  if (collections.isPending) return <PageLoading />
  if (collections.error) {
    return (
      <div className="p-8 text-sm text-red-500">
        Could not load your collections. Refresh to try again.
      </div>
    )
  }

  const builtIns = collections.data.filter((c) => c.type !== 'CUSTOM')
  const customs = collections.data.filter((c) => c.type === 'CUSTOM')

  return (
    <div className="mx-auto flex max-w-[1136px] flex-col gap-7 p-4 pb-24 md:p-8">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">Collections</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Group levels however you like — backlogs, favorites, themed sets.
        </p>
      </header>

      <section aria-label="Pinned collections">
        <SectionLabel>Pinned</SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {builtIns.map((c) => (
            <CollectionCard key={c.id} collection={c} />
          ))}
        </div>
      </section>

      <section aria-label="Your collections">
        <SectionLabel>Your collections</SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {customs.map((c) => (
            <CollectionCard key={c.id} collection={c} />
          ))}
          <CreateCollectionCard onClick={() => setCreateOpen(true)} />
        </div>
      </section>

      <CollectionFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        isSaving={createCollection.isPending}
        onSave={async (input) => {
          const detail = await createCollection.mutateAsync(input)
          toast.success(`Created ${detail.name}`)
          setCreateOpen(false)
        }}
      />
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">
      {children}
    </p>
  )
}
