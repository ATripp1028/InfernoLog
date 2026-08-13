import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { CollectionType } from '@infernolog/core'
import { CollectionCard } from '../CollectionCard'
import { makeCollectionSummary, renderWithProviders } from '@/utils/testUtils'

describe('CollectionCard', () => {
  it('links to the collection it represents', async () => {
    await renderWithProviders(
      <CollectionCard
        collection={makeCollectionSummary({ id: 'abc-123', name: 'Hardest' })}
      />,
      { router: true }
    )

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/collections/abc-123'
    )
  })

  it('tags a built-in collection and leaves a custom one untagged', async () => {
    const { unmount } = await renderWithProviders(
      <CollectionCard
        collection={makeCollectionSummary({
          type: CollectionType.WANT_TO_BEAT,
        })}
      />,
      { router: true }
    )
    expect(screen.getByText('Built-in')).toBeInTheDocument()
    unmount()

    await renderWithProviders(
      <CollectionCard
        collection={makeCollectionSummary({ type: CollectionType.CUSTOM })}
      />,
      { router: true }
    )
    expect(screen.queryByText('Built-in')).not.toBeInTheDocument()
  })

  it('renders a thumbnail only when the collection has a preview level', async () => {
    const { container, unmount } = await renderWithProviders(
      <CollectionCard
        collection={makeCollectionSummary({ previewLevelIds: ['128'] })}
      />,
      { router: true }
    )
    expect(container.querySelector('img')).toBeInTheDocument()
    unmount()

    const { container: empty } = await renderWithProviders(
      <CollectionCard
        collection={makeCollectionSummary({ previewLevelIds: [] })}
      />,
      { router: true }
    )
    expect(empty.querySelector('img')).not.toBeInTheDocument()
  })
})
