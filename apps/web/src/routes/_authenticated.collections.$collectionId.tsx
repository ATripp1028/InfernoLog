import { createFileRoute } from '@tanstack/react-router'
import { CollectionDetail } from '@/pages/CollectionDetail'

export const Route = createFileRoute(
  '/_authenticated/collections/$collectionId'
)({
  component: CollectionDetailRoute,
})

function CollectionDetailRoute() {
  const { collectionId } = Route.useParams()
  return <CollectionDetail collectionId={collectionId} />
}
