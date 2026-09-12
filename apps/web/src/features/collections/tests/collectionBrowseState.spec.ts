import { describe, expect, it } from 'vitest'
import {
  COLLECTION_DEFAULT_SORT,
  COLLECTION_SORT_OPTIONS,
  collectionBrowseState,
  toCollectionSearchParams,
  validateCollectionSearch,
} from '../collectionBrowseState'

describe('the collection sort menu', () => {
  it('leads with level ID, the default', () => {
    expect(COLLECTION_DEFAULT_SORT).toBe('levelId')
    expect(COLLECTION_SORT_OPTIONS[0]).toMatchObject({ value: 'levelId' })
  })

  // Relevance ranks the whole cache against a query; within one collection
  // the query is a filter, not an order.
  it('offers no relevance sort', () => {
    expect(COLLECTION_SORT_OPTIONS.map((o) => o.value)).not.toContain(
      'relevance'
    )
  })

  it('declares each sort once', () => {
    const values = COLLECTION_SORT_OPTIONS.map((o) => o.value)

    expect(new Set(values).size).toBe(values.length)
  })
})

describe('validateCollectionSearch', () => {
  // A plain link to a collection carries no params, and the page is fine.
  it('reads an empty URL as no params at all', () => {
    expect(validateCollectionSearch({})).toEqual({})
  })

  it('keeps a real sort and its filters', () => {
    expect(
      validateCollectionSearch({
        sort: 'likes',
        difficulty: ['demon-hard'],
        query: 'blood',
      })
    ).toMatchObject({
      sort: 'likes',
      difficulty: ['demon-hard'],
      query: 'blood',
    })
  })

  it('drops a sort the collection menu does not offer', () => {
    expect(validateCollectionSearch({ sort: 'relevance' }).sort).toBeUndefined()
  })

  it('drops an extremes-only sort that arrives without its filter', () => {
    expect(validateCollectionSearch({ sort: 'aredlRank' }).sort).toBeUndefined()
  })
})

describe('collectionBrowseState', () => {
  it('fills in name search and level-ID order', () => {
    expect(collectionBrowseState({})).toMatchObject({
      searchBy: 'name',
      sort: 'levelId',
    })
  })

  it('round-trips through the URL form', () => {
    const state = collectionBrowseState({
      searchBy: 'creator',
      sort: 'gddlTier',
      query: 'viprin',
    })

    expect(collectionBrowseState(toCollectionSearchParams(state))).toEqual(
      state
    )
  })
})

describe('toCollectionSearchParams', () => {
  it('leaves the defaults out of the URL', () => {
    expect(
      toCollectionSearchParams({
        query: 'blood',
        searchBy: 'name',
        sort: 'levelId',
      })
    ).toEqual({ query: 'blood' })
  })

  it('keeps anything that differs from the default', () => {
    expect(
      toCollectionSearchParams({ searchBy: 'creator', sort: 'likes' })
    ).toEqual({ searchBy: 'creator', sort: 'likes' })
  })

  // Clearing the Extreme Demon filter under an AREDL sort falls back to the
  // collection's default order, not /search's relevance.
  it('falls back to level ID when an extremes-only sort loses its filter', () => {
    expect(
      toCollectionSearchParams({ searchBy: 'name', sort: 'sheetTier' }).sort
    ).toBeUndefined()
  })
})
