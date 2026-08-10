// Review step: what parsed, what will be skipped, and the per-tab flag
// breakdown — plus the blanket-override opt-in. Every count it renders is
// derived in useReviewStep.

import { Button } from '@/components/ui/button'
import { FlagList } from '../WizardChrome'
import type { ParseResult } from '../parseSpreadsheet'
import type { AllFlags } from '../importWizardModel'
import { useReviewStep } from './useReviewStep'

interface ReviewStepProps {
  parseResult: ParseResult
  flags: AllFlags
  onSkipFlagged: () => void
  onReUpload: () => void
  // Onboarding: a brand-new account has nothing to conflict with, so the
  // override checkbox would have nothing to do — hidden rather than shown
  // disabled.
  showOverrideOption: boolean
  blanketOverride: boolean
  onBlanketOverrideChange: (v: boolean) => void
}

export function ReviewStep({
  parseResult,
  flags,
  onSkipFlagged,
  onReUpload,
  showOverrideOption,
  blanketOverride,
  onBlanketOverrideChange,
}: ReviewStepProps) {
  const {
    errorFlags,
    errorFlagsByTab,
    dataWarnByTab,
    nameOnlyByTab,
    totalNameOnly,
    totalDataWarn,
    validCompletions,
    validProgress,
    validDropped,
    totalRanked,
    totalListed,
    totalRated,
    totalValid,
    totalSkipped,
  } = useReviewStep(parseResult, flags)

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-[var(--color-border)] p-4 bg-[var(--color-bg-surface)]">
        <p className="text-sm font-medium">
          {totalValid} row{totalValid !== 1 ? 's' : ''} ready
          {totalSkipped > 0 && (
            <>
              ,{' '}
              <span className="text-[var(--color-danger)]">
                {totalSkipped} skipped
              </span>
            </>
          )}
          {totalNameOnly > 0 && (
            <>
              ,{' '}
              <span className="text-amber-600 dark:text-amber-400">
                {totalNameOnly} name-only
              </span>
            </>
          )}
          {totalDataWarn > 0 && (
            <>
              ,{' '}
              <span className="text-amber-600 dark:text-amber-400">
                {totalDataWarn} with dropped value
                {totalDataWarn !== 1 ? 's' : ''}
              </span>
            </>
          )}
        </p>
        <div className="mt-1 text-xs text-muted-foreground">
          {validCompletions.length} completions ·{' '}
          {validProgress.length > 0 &&
            `${validProgress.length} progress logs · `}
          {validDropped.length} dropped
          {totalRanked > 0 && ` · ${totalRanked} ranked`}
          {totalListed > 0 && ` · ${totalListed} list entries`}
          {totalRated > 0 && ` · ${totalRated} rated`}
          {totalNameOnly > 0 &&
            ' · name-only rows will be resolved during import'}
        </div>
      </div>

      {flags.duplicates.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">
            Duplicate level IDs in same tab
          </p>
          <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
            {flags.duplicates.map((d) => (
              <li key={`${d.tab}-${d.levelId}`}>
                Level {d.levelId} appears {d.rows.length}× in Completions (rows{' '}
                {d.rows.map((r) => r + 2).join(', ')})
              </li>
            ))}
          </ul>
        </div>
      )}

      {errorFlags.length > 0 && (
        <div>
          <p className="text-sm font-medium text-[var(--color-danger)] mb-1">
            Rows that will be skipped
          </p>
          {errorFlagsByTab.completions.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Completions tab
              </p>
              <FlagList flags={errorFlagsByTab.completions} />
            </>
          )}
          {errorFlagsByTab.progress.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Progress tab
              </p>
              <FlagList flags={errorFlagsByTab.progress} />
            </>
          )}
          {errorFlagsByTab.dropped.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Dropped tab
              </p>
              <FlagList flags={errorFlagsByTab.dropped} />
            </>
          )}
          {errorFlagsByTab.ranking.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Ranking tab
              </p>
              <FlagList flags={errorFlagsByTab.ranking} />
            </>
          )}
          {errorFlagsByTab.lists.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Lists tab
              </p>
              <FlagList flags={errorFlagsByTab.lists} />
            </>
          )}
          {errorFlagsByTab.ratings.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Ratings tab
              </p>
              <FlagList flags={errorFlagsByTab.ratings} />
            </>
          )}
        </div>
      )}

      {totalDataWarn > 0 && (
        <div>
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-1">
            Bad values (dropped — the rest of the row still imports)
          </p>
          {dataWarnByTab.completions.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Completions tab
              </p>
              <FlagList flags={dataWarnByTab.completions} />
            </>
          )}
          {dataWarnByTab.progress.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Progress tab
              </p>
              <FlagList flags={dataWarnByTab.progress} />
            </>
          )}
          {dataWarnByTab.dropped.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Dropped tab
              </p>
              <FlagList flags={dataWarnByTab.dropped} />
            </>
          )}
          {dataWarnByTab.ranking.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Ranking tab
              </p>
              <FlagList flags={dataWarnByTab.ranking} />
            </>
          )}
          {dataWarnByTab.lists.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Lists tab
              </p>
              <FlagList flags={dataWarnByTab.lists} />
            </>
          )}
          {dataWarnByTab.ratings.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Ratings tab
              </p>
              <FlagList flags={dataWarnByTab.ratings} />
            </>
          )}
        </div>
      )}

      {totalNameOnly > 0 && (
        <div>
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-1">
            Name-only rows (ID resolved during import)
          </p>
          {nameOnlyByTab.completions.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Completions tab
              </p>
              <FlagList flags={nameOnlyByTab.completions} />
            </>
          )}
          {nameOnlyByTab.progress.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Progress tab
              </p>
              <FlagList flags={nameOnlyByTab.progress} />
            </>
          )}
          {nameOnlyByTab.dropped.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Dropped tab
              </p>
              <FlagList flags={nameOnlyByTab.dropped} />
            </>
          )}
          {nameOnlyByTab.ranking.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Ranking tab
              </p>
              <FlagList flags={nameOnlyByTab.ranking} />
            </>
          )}
          {nameOnlyByTab.lists.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Lists tab
              </p>
              <FlagList flags={nameOnlyByTab.lists} />
            </>
          )}
          {nameOnlyByTab.ratings.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Ratings tab
              </p>
              <FlagList flags={nameOnlyByTab.ratings} />
            </>
          )}
        </div>
      )}

      {showOverrideOption && (
        <label className="flex items-start gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={blanketOverride}
            onChange={(e) => onBlanketOverrideChange(e.target.checked)}
          />
          <span>
            <span className="font-medium">Imported data always wins</span>
            <span className="block text-xs text-muted-foreground">
              Skip conflict review entirely — anything that conflicts with
              what's already in InfernoLog is overwritten with the spreadsheet's
              values, and list/ranking order disagreements use the spreadsheet's
              order.
            </span>
          </span>
        </label>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onReUpload}>
          Fix and re-upload
        </Button>
        <Button onClick={onSkipFlagged} disabled={totalValid === 0}>
          Import {totalValid} row{totalValid !== 1 ? 's' : ''}
          {totalSkipped > 0 ? `, skip ${totalSkipped}` : ''}
        </Button>
      </div>
    </div>
  )
}

// The resolve-conflicts step is FieldConflictMerge itself, fed directly from
// completionConflicts by the wizard root — no dedicated wrapper component
// needed (unlike the old ConflictStep, there's no bespoke per-row UI left to
// own here; see the wizard root's render for the props it's given).
