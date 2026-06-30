// Three-step spreadsheet import wizard.
//
// Step 1: Upload — file picker + date format selector + client validation.
// Step 2: Conflict — review existing-vs-incoming completions; pick resolution.
// Step 3: Commit — progress bar while batches are sent; success report.

import { useState, useRef, useCallback, useId } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useImportApi } from '@/lib/api/import'
import type {
  ImportConflict,
  ImportCommitRow,
  ImportCommitOutcome,
  ConflictResolution,
} from '@/lib/api/import'
import {
  parseSpreadsheet,
  type DateFormat,
  type ParseResult,
  type ParseFlag,
  type ParsedCompletionRow,
  type ParsedDroppedRow,
} from './parseSpreadsheet'
import { downloadTemplate } from './generateTemplate'
import type { MeData } from '@/lib/api/me'

// ── Helpers ────────────────────────────────────────────────────────────────

function randomUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

const BATCH_SIZE = 50

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ── Types ──────────────────────────────────────────────────────────────────

type WizardStep = 'upload' | 'review' | 'conflict' | 'committing' | 'success'

interface AllFlags {
  completions: ParseFlag[]
  dropped: ParseFlag[]
  duplicates: ParseResult['duplicateLevelIds']
}

// ── Date format labels ─────────────────────────────────────────────────────

const DATE_OPTIONS: { value: DateFormat; label: string }[] = [
  { value: 'MDY', label: 'MM/DD/YYYY (US)' },
  { value: 'DMY', label: 'DD/MM/YYYY (International)' },
  { value: 'ISO', label: 'YYYY-MM-DD (ISO dashes)' },
  { value: 'YMD', label: 'YYYY/MM/DD (ISO slashes)' },
]

// ── Sub-components ─────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: WizardStep }) {
  const steps: { id: WizardStep | 'done'; label: string }[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'review', label: 'Review' },
    { id: 'conflict', label: 'Conflicts' },
    { id: 'committing', label: 'Import' },
    { id: 'success', label: 'Done' },
  ]

  const ORDER: Record<WizardStep | 'done', number> = {
    upload: 0,
    review: 1,
    conflict: 2,
    committing: 3,
    success: 4,
    done: 5,
  }

  const current = ORDER[step]

  return (
    <ol className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
      {steps.map(({ id, label }, i) => (
        <li key={id} className="flex items-center gap-2">
          {i > 0 && <span className="text-muted-foreground/40">›</span>}
          <span
            className={cn(
              ORDER[id] === current && 'font-semibold text-foreground',
              ORDER[id] < current && 'text-muted-foreground/60 line-through'
            )}
          >
            {label}
          </span>
        </li>
      ))}
    </ol>
  )
}

function FlagList({ flags, limit = 10 }: { flags: ParseFlag[]; limit?: number }) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? flags : flags.slice(0, limit)

  if (!flags.length) return null
  return (
    <ul className="mt-2 space-y-1 text-xs">
      {shown.map((f) => (
        <li
          key={`${f.rowIndex}-${f.field}`}
          className={
            f.severity === 'warning'
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-[var(--color-danger)]'
          }
        >
          Row {f.rowIndex + 2} · {f.field} — {f.message}
        </li>
      ))}
      {flags.length > limit && !showAll && (
        <li>
          <button
            className="underline text-muted-foreground"
            onClick={() => setShowAll(true)}
          >
            +{flags.length - limit} more
          </button>
        </li>
      )}
    </ul>
  )
}

// ── Upload step ────────────────────────────────────────────────────────────

interface UploadStepProps {
  dateFormat: DateFormat
  onDateFormatChange: (f: DateFormat) => void
  onParsed: (result: ParseResult, flags: AllFlags) => void
}

function UploadStep({ dateFormat, onDateFormatChange, onParsed }: UploadStepProps) {
  const fileId = useId()
  const [error, setError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      setParsing(true)
      try {
        const buffer = await file.arrayBuffer()
        const result = parseSpreadsheet(buffer, dateFormat)

        const allCompletionFlags = result.completions.flatMap((r) => r.flags)
        const allDroppedFlags = result.dropped.flatMap((r) => r.flags)

        onParsed(result, {
          completions: allCompletionFlags,
          dropped: allDroppedFlags,
          duplicates: result.duplicateLevelIds,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse spreadsheet')
      } finally {
        setParsing(false)
      }
    },
    [dateFormat, onParsed]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Import your completion history from a spreadsheet. Download the
            template first if you haven't already.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={downloadTemplate}
        >
          Download template
        </Button>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Date format</label>
        <p className="text-xs text-muted-foreground mb-2">
          Select the date format used in your spreadsheet.
        </p>
        <Select
          value={dateFormat}
          onValueChange={(v) => onDateFormatChange(v as DateFormat)}
        >
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label htmlFor={fileId} className="block text-sm font-medium mb-1.5">
          Spreadsheet file
        </label>
        <label
          htmlFor={fileId}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed',
            'border-[var(--color-border)] bg-[var(--color-bg-surface)] p-10 cursor-pointer',
            'hover:border-[var(--color-primary)] hover:bg-accent transition-colors text-center',
            parsing && 'pointer-events-none opacity-60'
          )}
        >
          <span className="text-2xl">📂</span>
          <span className="text-sm text-foreground font-medium">
            {parsing ? 'Parsing…' : 'Click to select or drag and drop'}
          </span>
          <span className="text-xs text-muted-foreground">.xlsx files only</span>
          <input
            id={fileId}
            type="file"
            accept=".xlsx,.xls"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
              e.target.value = ''
            }}
          />
        </label>
        {error && (
          <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>
        )}
      </div>
    </div>
  )
}

// ── Review step ────────────────────────────────────────────────────────────

interface ReviewStepProps {
  parseResult: ParseResult
  flags: AllFlags
  onSkipFlagged: () => void
  onReUpload: () => void
}

function ReviewStep({ parseResult, flags, onSkipFlagged, onReUpload }: ReviewStepProps) {
  const allFlags = [...flags.completions, ...flags.dropped]
  const errorFlags = allFlags.filter((f) => f.severity === 'error')
  const warningFlags = allFlags.filter((f) => f.severity === 'warning')
  const errorFlagsByTab = {
    completions: flags.completions.filter((f) => f.severity === 'error'),
    dropped: flags.dropped.filter((f) => f.severity === 'error'),
  }
  const warningFlagsByTab = {
    completions: flags.completions.filter((f) => f.severity === 'warning'),
    dropped: flags.dropped.filter((f) => f.severity === 'warning'),
  }

  const validCompletions = parseResult.completions.filter(
    (r) => !r.flags.some((f) => f.severity === 'error') && (r.data.levelId || r.data.levelName)
  )
  const validDropped = parseResult.dropped.filter(
    (r) => !r.flags.some((f) => f.severity === 'error') && (r.data.levelId || r.data.levelName)
  )
  const totalValid = validCompletions.length + validDropped.length
  const totalSkipped = errorFlags.length + flags.duplicates.length
  const totalNameOnly = warningFlags.length

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-[var(--color-border)] p-4 bg-[var(--color-bg-surface)]">
        <p className="text-sm font-medium">
          {totalValid} row{totalValid !== 1 ? 's' : ''} ready
          {totalSkipped > 0 && (
            <>,{' '}
              <span className="text-[var(--color-danger)]">
                {totalSkipped} skipped
              </span>
            </>
          )}
          {totalNameOnly > 0 && (
            <>,{' '}
              <span className="text-amber-600 dark:text-amber-400">
                {totalNameOnly} name-only
              </span>
            </>
          )}
        </p>
        <div className="mt-1 text-xs text-muted-foreground">
          {validCompletions.length} completions · {validDropped.length} dropped
          {totalNameOnly > 0 && ' · name-only rows will be resolved during import'}
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
                Level {d.levelId} appears {d.rows.length}× in{' '}
                {d.tab === 'completions' ? 'Completions' : 'Dropped'} (rows{' '}
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
              <p className="text-xs text-muted-foreground font-medium mt-2">Completions tab</p>
              <FlagList flags={errorFlagsByTab.completions} />
            </>
          )}
          {errorFlagsByTab.dropped.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">Dropped tab</p>
              <FlagList flags={errorFlagsByTab.dropped} />
            </>
          )}
        </div>
      )}

      {warningFlags.length > 0 && (
        <div>
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-1">
            Name-only rows (ID resolved during import)
          </p>
          {warningFlagsByTab.completions.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">Completions tab</p>
              <FlagList flags={warningFlagsByTab.completions} />
            </>
          )}
          {warningFlagsByTab.dropped.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-medium mt-2">Dropped tab</p>
              <FlagList flags={warningFlagsByTab.dropped} />
            </>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onReUpload}>
          Fix and re-upload
        </Button>
        <Button
          onClick={onSkipFlagged}
          disabled={totalValid === 0}
        >
          Import {totalValid} row{totalValid !== 1 ? 's' : ''}
          {totalSkipped > 0 ? `, skip ${totalSkipped}` : ''}
        </Button>
      </div>
    </div>
  )
}

// ── Conflict step ──────────────────────────────────────────────────────────

interface ConflictStepProps {
  conflicts: ImportConflict[]
  resolutions: Record<string, ConflictResolution>
  onResolutionChange: (levelId: string, r: ConflictResolution) => void
  onBulkResolution: (r: ConflictResolution) => void
  onCommit: () => void
}

function ConflictStep({
  conflicts,
  resolutions,
  onResolutionChange,
  onBulkResolution,
  onCommit,
}: ConflictStepProps) {
  const unresolvedCount = conflicts.filter((c) => !resolutions[c.levelId]).length

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {conflicts.length} level{conflicts.length !== 1 ? 's' : ''} in your
        spreadsheet already have a completion. Choose what to do with each.
      </p>

      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
        <strong>Overwrite</strong> replaces the existing completion entirely
        with the spreadsheet version, including clearing fields the sheet
        leaves blank. This is not a merge.
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onBulkResolution('skip')}
        >
          Skip all
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onBulkResolution('overwrite')}
        >
          Overwrite all
        </Button>
      </div>

      <div className="border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border)] max-h-80 overflow-y-auto">
        {conflicts.map((c) => (
          <div
            key={c.levelId}
            className="px-4 py-3 flex items-center justify-between gap-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {c.levelName ?? `Level ${c.levelId}`}
              </p>
              <p className="text-xs text-muted-foreground">
                ID {c.levelId}
                {c.date ? ` · ${c.date}` : ''}
                {c.attempts != null ? ` · ${c.attempts.toLocaleString()} attempts` : ''}
              </p>
            </div>
            <Select
              value={resolutions[c.levelId] ?? ''}
              onValueChange={(v) =>
                onResolutionChange(c.levelId, v as ConflictResolution)
              }
            >
              <SelectTrigger className="w-36 shrink-0">
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skip">Skip</SelectItem>
                <SelectItem value="overwrite">Overwrite</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <Button onClick={onCommit} disabled={unresolvedCount > 0}>
        {unresolvedCount > 0
          ? `Resolve ${unresolvedCount} remaining conflict${unresolvedCount !== 1 ? 's' : ''}`
          : 'Start import'}
      </Button>
    </div>
  )
}

// ── Progress bar ───────────────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden">
      <div
        className="h-full bg-primary transition-all duration-300"
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  )
}

// ── Success step ───────────────────────────────────────────────────────────

interface SuccessStepProps {
  outcomes: ImportCommitOutcome[]
  onClose: () => void
}

function SuccessStep({ outcomes, onClose }: SuccessStepProps) {
  const committed = outcomes.filter((o) => o.status === 'committed')
  const skipped = outcomes.filter((o) => o.status === 'skipped')
  const failed = outcomes.filter((o) => o.status === 'failed')

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <p className="text-3xl">🎉</p>
        <p className="text-lg font-semibold">Import complete</p>
        <p className="text-sm text-muted-foreground">
          {committed.length} row{committed.length !== 1 ? 's' : ''} imported
          {skipped.length > 0 && `, ${skipped.length} skipped`}
          {failed.length > 0 && `, ${failed.length} failed`}
        </p>
      </div>

      {(failed.length > 0 || skipped.length > 0) && (
        <div className="rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)] max-h-56 overflow-y-auto text-xs">
          {failed.map((o) => (
            <div key={o.rowIndex} className="px-3 py-2 flex gap-2">
              <span className="text-[var(--color-danger)] font-medium">Failed</span>
              <span className="text-muted-foreground">
                Row {o.rowIndex + 1}
                {o.reason ? ` — ${o.reason}` : ''}
              </span>
            </div>
          ))}
          {skipped.map((o) => (
            <div key={o.rowIndex} className="px-3 py-2 flex gap-2">
              <span className="text-muted-foreground font-medium">Skipped</span>
              <span className="text-muted-foreground">Row {o.rowIndex + 1}</span>
            </div>
          ))}
        </div>
      )}

      {committed.length > 0 && failed.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Level metadata for new levels is being fetched in the background.
          Your log will update shortly.
        </p>
      )}

      <Button onClick={onClose} className="w-full">
        Done
      </Button>
    </div>
  )
}

// ── Wizard root ────────────────────────────────────────────────────────────

interface ImportWizardProps {
  me: MeData
  onClose: () => void
}

export function ImportWizard({ me, onClose }: ImportWizardProps) {
  const { checkConflicts, commitBatch } = useImportApi()

  const [step, setStep] = useState<WizardStep>('upload')
  const [dateFormat, setDateFormat] = useState<DateFormat>(
    me.dateFormatPreference as DateFormat
  )
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [allFlags, setAllFlags] = useState<AllFlags>({
    completions: [],
    dropped: [],
    duplicates: [],
  })
  const [conflicts, setConflicts] = useState<ImportConflict[]>([])
  const [resolutions, setResolutions] = useState<Record<string, ConflictResolution>>({})
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [outcomes, setOutcomes] = useState<ImportCommitOutcome[]>([])
  const [commitError, setCommitError] = useState<string | null>(null)

  const importJobId = useRef(randomUUID())

  // ── Valid rows (excludes error-flagged rows; name-only rows are included) ──
  const validRows = useCallback(
    (result: ParseResult) => ({
      completions: result.completions.filter(
        (r) => !r.flags.some((f) => f.severity === 'error') && (r.data.levelId || r.data.levelName)
      ),
      dropped: result.dropped.filter(
        (r) => !r.flags.some((f) => f.severity === 'error') && (r.data.levelId || r.data.levelName)
      ),
    }),
    []
  )

  // ── Step: upload → review ──────────────────────────────────────────────

  const handleParsed = useCallback(
    (result: ParseResult, flags: AllFlags) => {
      setParseResult(result)
      setAllFlags(flags)
      setStep('review')
    },
    []
  )

  // ── Commit loop ────────────────────────────────────────────────────────

  const runCommit = useCallback(
    async (
      completions: ParsedCompletionRow[],
      dropped: ParsedDroppedRow[],
      res: Record<string, ConflictResolution>
    ) => {
      setProgressLabel('Importing…')
      setProgress(0)
      setOutcomes([])
      setCommitError(null)

      // Build the flat row list with stable indices.
      const allCommitRows: ImportCommitRow[] = [
        ...completions.map((r): ImportCommitRow => {
          // Name-only rows (null levelId) can't have pre-checked conflicts.
          const resolution = r.data.levelId ? res[r.data.levelId] : undefined
          return resolution
            ? { type: 'completion', rowIndex: r.rowIndex, data: r.data, conflictResolution: resolution }
            : { type: 'completion', rowIndex: r.rowIndex, data: r.data }
        }),
        ...dropped.map(
          (r): ImportCommitRow => ({
            type: 'dropped',
            rowIndex: r.rowIndex + 100000, // offset to avoid collision with completion indices
            data: r.data,
          })
        ),
      ]

      const total = allCommitRows.length
      const batches = chunk(allCommitRows, BATCH_SIZE)
      const allOutcomes: ImportCommitOutcome[] = []

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i] ?? []
        if (!batch.length) continue
        try {
          const result = await commitBatch({
            importJobId: importJobId.current,
            rows: batch,
          })
          allOutcomes.push(...result.outcomes)
        } catch (err) {
          // Mark the whole batch as failed rather than aborting.
          allOutcomes.push(
            ...batch.map((r) => ({
              rowIndex: r.rowIndex,
              status: 'failed' as const,
              reason: err instanceof Error ? err.message : 'Network error',
            }))
          )
        }
        setProgress(((i + 1) / batches.length) * 100)
        setProgressLabel(
          `Importing… ${Math.min((i + 1) * BATCH_SIZE, total)} / ${total}`
        )
      }

      setOutcomes(allOutcomes)
      setStep('success')
    },
    [commitBatch]
  )

  // ── Step: review → conflict check / commit ─────────────────────────────

  const handleSkipFlagged = useCallback(async () => {
    if (!parseResult) return

    const { completions, dropped } = validRows(parseResult)
    // Only check conflicts for rows with known level IDs; name-only rows
    // can't have pre-existing conflicts until the server resolves their ID.
    const allLevelIds = [
      ...new Set([
        ...completions.flatMap((r) => r.data.levelId ? [r.data.levelId] : []),
        ...dropped.flatMap((r) => r.data.levelId ? [r.data.levelId] : []),
      ]),
    ]

    setStep('committing')
    setProgressLabel('Checking for conflicts…')

    try {
      const checkResult = allLevelIds.length > 0
        ? await checkConflicts(allLevelIds)
        : { conflicts: [] }
      if (checkResult.conflicts.length > 0) {
        setConflicts(checkResult.conflicts)
        setResolutions({})
        setStep('conflict')
      } else {
        await runCommit(completions, dropped, {})
      }
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : 'Failed to check conflicts')
      setStep('review')
    }
  }, [parseResult, validRows, checkConflicts, runCommit])

  // ── Step: conflict → commit ────────────────────────────────────────────

  const handleCommitAfterConflict = useCallback(async () => {
    if (!parseResult) return
    const { completions, dropped } = validRows(parseResult)
    setStep('committing')
    await runCommit(completions, dropped, resolutions)
  }, [parseResult, validRows, resolutions, runCommit])

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Import spreadsheet</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Bring your completion history into InfernoLog from an existing spreadsheet.
        </p>
      </div>

      <StepIndicator step={step} />

      {step === 'upload' && (
        <UploadStep
          dateFormat={dateFormat}
          onDateFormatChange={setDateFormat}
          onParsed={handleParsed}
        />
      )}

      {step === 'review' && parseResult && (
        <ReviewStep
          parseResult={parseResult}
          flags={allFlags}
          onSkipFlagged={() => void handleSkipFlagged()}
          onReUpload={() => setStep('upload')}
        />
      )}

      {step === 'conflict' && (
        <ConflictStep
          conflicts={conflicts}
          resolutions={resolutions}
          onResolutionChange={(id, r) =>
            setResolutions((prev) => ({ ...prev, [id]: r }))
          }
          onBulkResolution={(r) =>
            setResolutions(
              Object.fromEntries(conflicts.map((c) => [c.levelId, r]))
            )
          }
          onCommit={() => void handleCommitAfterConflict()}
        />
      )}

      {step === 'committing' && (
        <div className="space-y-3 py-4">
          <ProgressBar value={progress} />
          <p className="text-sm text-muted-foreground text-center">{progressLabel}</p>
          {commitError && (
            <p className="text-xs text-[var(--color-danger)] text-center">{commitError}</p>
          )}
        </div>
      )}

      {step === 'success' && (
        <SuccessStep outcomes={outcomes} onClose={onClose} />
      )}

      {step !== 'success' && step !== 'committing' && (
        <div className="pt-2 border-t border-[var(--color-border)]">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}
