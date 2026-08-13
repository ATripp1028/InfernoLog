import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CollectionType } from '@infernolog/core'
import { AddToCollectionDialog } from '../AddToCollectionDialog'
import {
  useAddToCollectionDialog,
  type PickedLevel,
} from '../useAddToCollectionDialog'
import {
  makeCollectionSummary,
  makeSearchResult,
  renderWithProviders,
  setViewport,
  stubEscalation,
} from '@/utils/testUtils'

// The component's own logic file is the boundary this spec stubs — the hook is
// covered on its own in useAddToCollectionDialog.spec.ts, and re-driving it
// through the DOM here would assert the same branches twice while making the
// render assertions depend on state machinery this file does not own.
vi.mock('../useAddToCollectionDialog')

type DialogState = ReturnType<typeof useAddToCollectionDialog>

/** The hook's return value, defaulting to step 1 with nothing typed. */
function stubDialog(overrides: Partial<DialogState> = {}): DialogState {
  return {
    step: 'search',
    goBackToSearch: vi.fn(),
    canGoBack: false,
    levelQuery: '',
    trimmed: '',
    isNumeric: false,
    updateLevelQuery: vi.fn(),
    submitLevelQuery: vi.fn(),
    escalation: stubEscalation(),
    searchPending: false,
    results: [],
    cachedLevel: undefined,
    showResults: false,
    showCachedPreview: false,
    showSeedHint: false,
    showEmptyPrompt: true,
    seedingId: null,
    seededLevel: null,
    clearSeededLevel: vi.fn(),
    seedAndPick: vi.fn(),
    selectLevel: vi.fn(),
    pickedLevel: null,
    collectionQuery: '',
    setCollectionQuery: vi.fn(),
    collectionsLoading: false,
    collectionsFailed: false,
    hasBuiltIns: true,
    filteredCollections: [],
    selectedIds: new Set<string>(),
    levelAlreadyInCollectionIds: new Set<string>(),
    toggleCollection: vi.fn(),
    handleAdd: vi.fn(),
    isSubmitting: false,
    ...overrides,
  } as DialogState
}

/** Mounts the dialog open, with the hook reporting `state`. */
function renderDialog(
  state: Partial<DialogState> = {},
  props: Partial<Parameters<typeof AddToCollectionDialog>[0]> = {}
) {
  vi.mocked(useAddToCollectionDialog).mockReturnValue(stubDialog(state))
  return renderWithProviders(
    <AddToCollectionDialog open onClose={vi.fn()} {...props} />
  )
}

/** A level the caller already picked, skipping step 1. */
function pickedLevel(overrides: Partial<PickedLevel> = {}): PickedLevel {
  return {
    inGameId: '4284013',
    name: 'Bloodbath',
    creator: 'Riot',
    inGameDifficulty: 'EXTREME_DEMON',
    featured: true,
    epicValue: 0,
    isRated: true,
    ...overrides,
  }
}

beforeEach(() => {
  // The dialog forks its whole shell on the breakpoint; pin it so a spec that
  // does not care about layout still renders a deterministic one.
  setViewport('desktop')
})

describe('AddToCollectionDialog', () => {
  it('renders nothing while closed', () => {
    vi.mocked(useAddToCollectionDialog).mockReturnValue(stubDialog())
    const { container } = renderWithProviders(
      <AddToCollectionDialog open={false} onClose={vi.fn()} />
    )

    expect(container).toBeEmptyDOMElement()
  })

  describe('step 1 — level search', () => {
    it('prompts for a level when nothing has been typed', () => {
      renderDialog()

      expect(screen.getByText('Find a level')).toBeInTheDocument()
    })

    it('names the level being fetched while seeding from RobTop', () => {
      renderDialog({ showEmptyPrompt: false, seedingId: '4284013' })

      expect(
        screen.getByText(/Fetching level 4284013 from the GD servers/)
      ).toBeInTheDocument()
    })

    it('offers to fetch an unknown id from the GD servers', async () => {
      const seedAndPick = vi.fn()
      renderDialog({
        showEmptyPrompt: false,
        showSeedHint: true,
        trimmed: '128',
        seedAndPick,
      })

      await userEvent.click(
        screen.getByRole('button', { name: /Fetch level 128/ })
      )

      expect(seedAndPick).toHaveBeenCalledWith('128')
    })

    it('lists cache results and selects the one clicked', async () => {
      const selectLevel = vi.fn()
      const first = makeSearchResult({ name: 'Bloodbath' })
      renderDialog({
        showEmptyPrompt: false,
        showResults: true,
        trimmed: 'blood',
        results: [first, makeSearchResult({ name: 'Bloodlust' })],
        selectLevel,
      })

      expect(screen.getByText('Bloodbath')).toBeInTheDocument()
      expect(screen.getByText('Bloodlust')).toBeInTheDocument()

      await userEvent.click(screen.getByText('Bloodbath'))

      expect(selectLevel).toHaveBeenCalledWith(first)
    })

    it('says so when the cache has no match, quoting the query', () => {
      renderDialog({
        showEmptyPrompt: false,
        showResults: true,
        trimmed: 'zzzz',
        results: [],
      })

      expect(screen.getByText(/No levels match/)).toHaveTextContent('zzzz')
    })

    it('reports searching rather than an empty result while the query is in flight', () => {
      renderDialog({
        showEmptyPrompt: false,
        showResults: true,
        searchPending: true,
        trimmed: 'blood',
        results: [],
      })

      expect(screen.getByText('Searching…')).toBeInTheDocument()
      expect(screen.queryByText(/No levels match/)).not.toBeInTheDocument()
    })
  })

  describe('step 2 — collection picker', () => {
    const collections = [
      makeCollectionSummary({ id: 'c1', name: 'Favorites', type: CollectionType.FAVORITES }),
      makeCollectionSummary({ id: 'c2', name: 'Hardest', type: CollectionType.CUSTOM }),
    ]

    it('numbers the step only when the level was chosen in step 1', () => {
      const { unmount } = renderDialog({ step: 'pick', filteredCollections: collections })
      expect(screen.getByText('Step 2 · Collections')).toBeInTheDocument()
      unmount()

      renderDialog(
        { step: 'pick', filteredCollections: collections },
        { preselectedLevel: pickedLevel() }
      )
      expect(screen.getByText('Collections')).toBeInTheDocument()
      expect(screen.queryByText('Step 2 · Collections')).not.toBeInTheDocument()
    })

    it('distinguishes a load failure from missing built-ins', () => {
      const { unmount } = renderDialog({ step: 'pick', collectionsFailed: true })
      expect(screen.getByText("Couldn't load your collections")).toBeInTheDocument()
      unmount()

      renderDialog({ step: 'pick', hasBuiltIns: false })
      expect(screen.getByText('Collections not set up yet')).toBeInTheDocument()
    })

    it('marks collections the level is already in and offers no checkbox for them', () => {
      renderDialog({
        step: 'pick',
        filteredCollections: collections,
        levelAlreadyInCollectionIds: new Set(['c1']),
      })

      const already = screen.getByText('Favorites').closest('label')!
      expect(within(already).getByText('Already added')).toBeInTheDocument()
      expect(within(already).queryByRole('checkbox')).not.toBeInTheDocument()

      const selectable = screen.getByText('Hardest').closest('label')!
      expect(within(selectable).getByRole('checkbox')).toBeInTheDocument()
    })

    it('toggles a collection by its id', async () => {
      const toggleCollection = vi.fn()
      renderDialog({ step: 'pick', filteredCollections: collections, toggleCollection })

      await userEvent.click(
        within(screen.getByText('Hardest').closest('label')!).getByRole('checkbox')
      )

      expect(toggleCollection).toHaveBeenCalledWith('c2', true)
    })

    it('blocks confirmation until a collection is selected', () => {
      renderDialog({ step: 'pick', filteredCollections: collections })

      expect(
        screen.getByRole('button', { name: 'Select a collection' })
      ).toBeDisabled()
    })

    it('pluralises the confirm button by selection count', () => {
      const { unmount } = renderDialog({
        step: 'pick',
        filteredCollections: collections,
        selectedIds: new Set(['c1']),
      })
      expect(
        screen.getByRole('button', { name: 'Add to 1 collection' })
      ).toBeEnabled()
      unmount()

      renderDialog({
        step: 'pick',
        filteredCollections: collections,
        selectedIds: new Set(['c1', 'c2']),
      })
      expect(
        screen.getByRole('button', { name: 'Add to 2 collections' })
      ).toBeInTheDocument()
    })

    it('blocks a second submit while the first is in flight', () => {
      renderDialog({
        step: 'pick',
        filteredCollections: collections,
        selectedIds: new Set(['c1']),
        isSubmitting: true,
      })

      expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled()
    })

    it('offers a way back only when step 1 was actually shown', () => {
      const { unmount } = renderDialog({
        step: 'pick',
        filteredCollections: collections,
        canGoBack: true,
      })
      expect(screen.getByRole('button', { name: /Change level/ })).toBeInTheDocument()
      unmount()

      renderDialog({ step: 'pick', filteredCollections: collections, canGoBack: false })
      expect(screen.queryByRole('button', { name: /Change level/ })).not.toBeInTheDocument()
    })
  })

  it('closes from the header control on either layout', async () => {
    for (const viewport of ['desktop', 'mobile'] as const) {
      setViewport(viewport)
      const onClose = vi.fn()
      vi.mocked(useAddToCollectionDialog).mockReturnValue(stubDialog())
      const { unmount } = renderWithProviders(
        <AddToCollectionDialog open onClose={onClose} />
      )

      await userEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]!)

      expect(onClose, `${viewport} close`).toHaveBeenCalled()
      unmount()
    }
  })
})
