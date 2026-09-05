import { describe, expect, it } from 'vitest'
import type { LevelPageData } from '@/lib/api/levelPage'
import { LevelProgressStatus } from '@infernolog/core'
import type { LevelProgressListItem } from '@/lib/api/log'
import { resolveLevelOwnership } from '../ownership'
import { levelPageData, progressUpdate } from './fixtures'

const logRow = (
  status: LevelProgressStatus = LevelProgressStatus.IN_PROGRESS
): LevelProgressListItem => ({ status }) as LevelProgressListItem

const resolve = (
  sources: Partial<Parameters<typeof resolveLevelOwnership>[0]> = {}
) =>
  resolveLevelOwnership({
    levelQuerySettled: false,
    levelData: undefined,
    logCached: false,
    logRow: undefined,
    ...sources,
  })

describe('resolveLevelOwnership', () => {
  describe('once the level query has settled', () => {
    const settled = (levelData: LevelPageData | undefined) =>
      resolve({ levelQuerySettled: true, levelData })

    it('reads ownership off the progress id', () => {
      expect(settled(levelPageData())).toEqual({
        isOwner: true,
        hasCompletion: false,
      })
    })

    it('reads a completion off the logged updates', () => {
      expect(
        settled(
          levelPageData({
            progressUpdates: [progressUpdate({ kind: 'COMPLETION' })],
          })
        )
      ).toEqual({ isOwner: true, hasCompletion: true })
    })

    // A settled query with no payload is a 403/404/500 — an answer, not a
    // reason to keep waiting on the Log.
    it('reports no ownership for a query that returned nothing', () => {
      expect(settled(undefined)).toEqual({
        isOwner: false,
        hasCompletion: false,
      })
    })

    // The cached row can be up to a day stale, so the moment the query can
    // speak it does — even when the two disagree.
    it('overrides a cached row that disagrees', () => {
      expect(
        resolve({
          levelQuerySettled: true,
          levelData: undefined,
          logCached: true,
          logRow: logRow(LevelProgressStatus.COMPLETED),
        })
      ).toEqual({ isOwner: false, hasCompletion: false })
    })
  })

  describe('before the level query lands', () => {
    it('takes a cached Log row as ownership', () => {
      expect(resolve({ logCached: true, logRow: logRow() })).toEqual({
        isOwner: true,
        hasCompletion: false,
      })
    })

    // COMPLETED holds exactly when a COMPLETION update exists, so the row
    // answers the second question too.
    it('takes a COMPLETED row as beaten', () => {
      expect(
        resolve({
          logCached: true,
          logRow: logRow(LevelProgressStatus.COMPLETED),
        })
      ).toEqual({ isOwner: true, hasCompletion: true })
    })

    it('takes a cached Log with no row for the level as not owned', () => {
      expect(resolve({ logCached: true, logRow: undefined })).toEqual({
        isOwner: false,
        hasCompletion: false,
      })
    })

    // An absent Log is not evidence of anything — it is the one case with no
    // answer, and the caller has to render the FAB disabled rather than guess.
    it('knows nothing without a cached Log', () => {
      expect(resolve()).toBeNull()
    })
  })
})
