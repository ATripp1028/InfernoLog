// Final report for a finished import: outcome counts plus whatever the
// ranking / collections / ratings passes reported. Purely a read of the
// import job's status payload.

import { Button } from '@/components/ui/button'
import { ImportStatusPanel } from '../ImportStatusPanel'
import type { ImportStatusResponse } from '@/lib/api/import'

interface SuccessStepProps {
  status: ImportStatusResponse
  onClose: () => void
}

export function SuccessStep({ status, onClose }: SuccessStepProps) {
  const { committed, updated, skipped, failed } = status.outcomeCounts
  const {
    rankingResult,
    collectionsResult: listsResult,
    ratingsResult,
  } = status

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <p className="text-3xl">🎉</p>
        <p className="text-lg font-semibold">Import complete</p>
        <p className="text-sm text-muted-foreground">
          {committed} row{committed !== 1 ? 's' : ''} imported
          {updated > 0 && `, ${updated} updated`}
          {skipped > 0 && `, ${skipped} skipped`}
          {failed > 0 && `, ${failed} failed`}
        </p>
        {rankingResult && (
          <p className="text-sm text-muted-foreground">
            {rankingResult.placed} level{rankingResult.placed !== 1 ? 's' : ''}{' '}
            ranked
            {rankingResult.skipped.length > 0 &&
              `, ${rankingResult.skipped.length} not ranked`}
          </p>
        )}
        {listsResult && listsResult.lists.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {listsResult.lists
              .map((l) => `${l.list} (${l.placed})`)
              .join(' · ')}
            {listsResult.skipped.length > 0 &&
              `, ${listsResult.skipped.length} list entr${listsResult.skipped.length === 1 ? 'y' : 'ies'} skipped`}
          </p>
        )}
        {ratingsResult &&
          (ratingsResult.scored > 0 || ratingsResult.skipped.length > 0) && (
            <p className="text-sm text-muted-foreground">
              {ratingsResult.scored} score
              {ratingsResult.scored !== 1 ? 's' : ''} across{' '}
              {ratingsResult.levels} level
              {ratingsResult.levels !== 1 ? 's' : ''}
              {ratingsResult.categoriesCreated.length > 0 &&
                ` · new categor${ratingsResult.categoriesCreated.length === 1 ? 'y' : 'ies'}: ${ratingsResult.categoriesCreated.join(', ')}`}
            </p>
          )}
      </div>

      {rankingResult && rankingResult.skipped.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 max-h-40 overflow-y-auto text-xs space-y-1">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            Not ranked
          </p>
          {rankingResult.skipped.map((s, i) => (
            <div key={i} className="text-amber-700 dark:text-amber-400">
              {s.label} — {s.reason}
            </div>
          ))}
        </div>
      )}

      {listsResult && listsResult.skipped.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 max-h-40 overflow-y-auto text-xs space-y-1">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            List entries skipped
          </p>
          {listsResult.skipped.map((s, i) => (
            <div key={i} className="text-amber-700 dark:text-amber-400">
              {s.label} — {s.reason}
            </div>
          ))}
        </div>
      )}

      {ratingsResult && ratingsResult.skipped.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 max-h-40 overflow-y-auto text-xs space-y-1">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            Ratings skipped
          </p>
          {ratingsResult.skipped.map((s, i) => (
            <div key={i} className="text-amber-700 dark:text-amber-400">
              {s.label} — {s.reason}
            </div>
          ))}
        </div>
      )}

      <ImportStatusPanel status={status} />

      {committed > 0 && failed === 0 && (
        <p className="text-xs text-muted-foreground">
          Level metadata for new levels is being fetched in the background. Your
          log will update shortly.
        </p>
      )}

      <Button onClick={onClose} className="w-full">
        Done
      </Button>
    </div>
  )
}
