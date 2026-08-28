import { describe, expect, it } from 'vitest'
import type { GddlListSyncResult, GddlSyncResult } from '@/lib/api/me'
import { buildListSyncToast, buildSyncToast } from '../gddlSyncToast'

const syncResult = (
  overrides: Partial<GddlSyncResult> = {}
): GddlSyncResult => ({
  created: 0,
  enriched: 0,
  skipped: 0,
  errors: [],
  ...overrides,
})

const errors = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    levelId: String(i),
    reason: 'nope',
  }))

const listSummary = (counts: Partial<Record<string, number>> = {}) => ({
  addedToInferno: Array<string>(counts.addedToInferno ?? 0).fill('x'),
  addedToGddl: Array<string>(counts.addedToGddl ?? 0).fill('x'),
  removedFromGddl: Array<string>(counts.removedFromGddl ?? 0).fill('x'),
  skipped: Array<string>(counts.skipped ?? 0).fill('x'),
})

const listResult = (
  favorites: Partial<Record<string, number>> = {},
  leastFavorites: Partial<Record<string, number>> = {}
): GddlListSyncResult =>
  ({
    favorites: listSummary(favorites),
    leastFavorites: listSummary(leastFavorites),
  }) as GddlListSyncResult

describe('buildSyncToast', () => {
  it('reports what was added and enriched', () => {
    expect(buildSyncToast(syncResult({ created: 3, enriched: 2 }))).toBe(
      'Sync complete — 3 completions added, 2 enriched'
    )
  })

  it.each([
    [1, 'completion'],
    [2, 'completions'],
  ])('pluralises %s as %s', (created, word) => {
    expect(buildSyncToast(syncResult({ created }))).toContain(
      `${created} ${word} added`
    )
  })

  it('omits a clause with nothing in it', () => {
    expect(buildSyncToast(syncResult({ created: 3 }))).toBe(
      'Sync complete — 3 completions added'
    )
  })

  // A sync that found nothing still reports, so the user knows it ran rather
  // than silently doing nothing.
  it('says so when there was nothing to import', () => {
    expect(buildSyncToast(syncResult())).toBe(
      'Sync complete — Nothing new to import'
    )
  })

  // Some levels importing and some failing is the common case, so errors are
  // appended rather than replacing the summary.
  it('appends failures alongside what did import', () => {
    expect(buildSyncToast(syncResult({ created: 3, errors: errors(2) }))).toBe(
      'Sync complete — 3 completions added · 2 levels could not be imported'
    )
  })

  it('pluralises a single failure', () => {
    expect(buildSyncToast(syncResult({ errors: errors(1) }))).toContain(
      '1 level could not be imported'
    )
  })

  it('reports failures even when nothing imported', () => {
    const toast = buildSyncToast(syncResult({ errors: errors(2) }))

    expect(toast).toContain('Nothing new to import')
    expect(toast).toContain('2 levels could not be imported')
  })

  // Skipped is counted server-side but deliberately not surfaced — it is the
  // ordinary "already have this" case, not something to report.
  it('says nothing about skipped levels', () => {
    expect(buildSyncToast(syncResult({ skipped: 12 }))).toBe(
      'Sync complete — Nothing new to import'
    )
  })
})

describe('buildListSyncToast', () => {
  it('reports movement in both directions', () => {
    expect(
      buildListSyncToast(
        listResult({ addedToInferno: 2, addedToGddl: 1, removedFromGddl: 3 })
      )
    ).toBe(
      'Lists synced — 2 levels added to InfernoLog, 1 pushed to GDDL, 3 removed from GDDL'
    )
  })

  // The user asked to sync "their lists", so the two are summed rather than
  // reported as two near-identical clauses.
  it('sums favorites and least-favorites into one count', () => {
    expect(
      buildListSyncToast(
        listResult({ addedToInferno: 2 }, { addedToInferno: 3 })
      )
    ).toContain('5 levels added to InfernoLog')
  })

  it('pluralises a single level', () => {
    expect(buildListSyncToast(listResult({ addedToInferno: 1 }))).toContain(
      '1 level added to InfernoLog'
    )
  })

  it('omits the clauses with nothing in them', () => {
    expect(buildListSyncToast(listResult({ addedToGddl: 1 }))).toBe(
      'Lists synced — 1 pushed to GDDL'
    )
  })

  it('says so when the lists already matched', () => {
    expect(buildListSyncToast(listResult())).toBe(
      'Lists synced — Nothing to sync'
    )
  })

  // A skipped level is one GDDL knows about that InfernoLog could not cache,
  // which is worth surfacing — unlike the completion sync's skips.
  it('appends the levels it could not cache', () => {
    expect(
      buildListSyncToast(listResult({ addedToInferno: 2, skipped: 3 }))
    ).toBe(
      'Lists synced — 2 levels added to InfernoLog · 3 levels could not be cached'
    )
  })

  it('sums skipped counts across both lists', () => {
    expect(
      buildListSyncToast(listResult({ skipped: 1 }, { skipped: 1 }))
    ).toContain('2 levels could not be cached')
  })

  it('reports skips even when nothing else happened', () => {
    const toast = buildListSyncToast(listResult({ skipped: 1 }))

    expect(toast).toContain('Nothing to sync')
    expect(toast).toContain('1 level could not be cached')
  })
})
