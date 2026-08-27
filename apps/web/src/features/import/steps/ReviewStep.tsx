import { Button } from '@/components/generic/button'
import { FlagList } from '../WizardChrome'
import { FLAG_TABS, type FlagsByTab } from '../importWizardModel'
import { useReviewStep } from './useReviewStep'

/**
 * Review step: what parsed, what will be skipped, and the per-tab flag
 * breakdown — plus the blanket-override opt-in. Every count it renders is
 * derived in useReviewStep.
 */
export function ReviewStep() {
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
    flags,
    handleSkipFlagged,
    onReUpload,
    showOverrideOption,
    blanketOverride,
    setBlanketOverride,
  } = useReviewStep()

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border p-4 bg-bg-surface">
        <p className="text-sm font-medium">
          {totalValid} row{totalValid !== 1 ? 's' : ''} ready
          {totalSkipped > 0 && (
            <>
              , <span className="text-danger">{totalSkipped} skipped</span>
            </>
          )}
          {totalNameOnly > 0 && (
            <>
              ,{' '}
              <span className="text-warning-soft">
                {totalNameOnly} name-only
              </span>
            </>
          )}
          {totalDataWarn > 0 && (
            <>
              ,{' '}
              <span className="text-warning-soft">
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

      {flags.legacyTabs.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
          <p className="mb-2 text-sm font-medium text-warning-soft">
            Tabs from an older export
          </p>
          <ul className="space-y-1 text-xs text-warning-soft">
            {flags.legacyTabs.map((t) => (
              <li key={t.found}>
                “{t.found}” is now “{t.expected}”. This tab will NOT be
                imported — rename it, or re-download the template, to import it.
              </li>
            ))}
          </ul>
        </div>
      )}

      {flags.duplicates.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
          <p className="text-sm font-medium text-warning-soft mb-2">
            Duplicate level IDs in same tab
          </p>
          <ul className="text-xs text-warning-soft space-y-1">
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
          <p className="text-sm font-medium text-danger mb-1">
            Rows that will be skipped
          </p>
          <FlagsByTabList groups={errorFlagsByTab} />
        </div>
      )}

      {totalDataWarn > 0 && (
        <div>
          <p className="text-sm font-medium text-warning-soft mb-1">
            Bad values (dropped — the rest of the row still imports)
          </p>
          <FlagsByTabList groups={dataWarnByTab} />
        </div>
      )}

      {totalNameOnly > 0 && (
        <div>
          <p className="text-sm font-medium text-warning-soft mb-1">
            Name-only rows (ID resolved during import)
          </p>
          <FlagsByTabList groups={nameOnlyByTab} />
        </div>
      )}

      {showOverrideOption && (
        <label className="flex items-start gap-2 rounded-lg border border-border bg-bg-surface p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={blanketOverride}
            onChange={(e) => setBlanketOverride(e.target.checked)}
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
        <Button onClick={handleSkipFlagged} disabled={totalValid === 0}>
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

/**
 * The per-tab flag breakdown under a heading — one labelled {@link FlagList}
 * per tab that actually has flags, in {@link FLAG_TABS} order.
 *
 * The review step renders three of these (skipped rows, dropped values,
 * name-only rows) and each used to spell out all six tabs by hand, so adding
 * a seventh tab meant finding eighteen places.
 */
function FlagsByTabList({ groups }: { groups: FlagsByTab }) {
  return (
    <>
      {FLAG_TABS.map(({ key, label }) =>
        groups[key].length > 0 ? (
          <div key={key}>
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              {label}
            </p>
            <FlagList flags={groups[key]} />
          </div>
        ) : null
      )}
    </>
  )
}
