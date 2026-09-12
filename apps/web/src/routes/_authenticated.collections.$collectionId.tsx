import { createFileRoute } from '@tanstack/react-router'
import { CollectionDetail } from '@/pages/CollectionDetail'
import {
  validateCollectionSearch,
  type CollectionSearchParams,
} from '@/features/collections/collectionBrowseState'

/**
 * One collection. The search params are an unordered collection's query, sort
 * and filters (see collectionBrowseState) — the URL is their source of truth,
 * as on /search, so a filtered view survives refresh and back. Every param is
 * optional, so a plain link to a collection carries none.
 */
export const Route = createFileRoute(
  '/_authenticated/collections/$collectionId'
)({
  component: CollectionDetailRoute,
  validateSearch: (search: Record<string, unknown>): CollectionSearchParams =>
    validateCollectionSearch(search),
})

function CollectionDetailRoute() {
  const { collectionId } = Route.useParams()
  return <CollectionDetail collectionId={collectionId} />
}
