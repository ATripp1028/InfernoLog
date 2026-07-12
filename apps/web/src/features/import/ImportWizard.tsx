// Three-step spreadsheet import wizard.
//
// Step 1: Upload — file picker + date format selector + client validation.
// Step 2: Conflict — review existing-vs-incoming completions; pick resolution.
// Step 3: Commit — progress bar while batches are sent; success report.

import { useState, useCallback, useId, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useImportApi, useImportStatus } from '@/lib/api/import'
import type {
  ImportConflict,
  ImportCommitRow,
  ConflictResolution,
  ImportStatusResponse,
} from '@/lib/api/import'
import { ImportStatusPanel } from './ImportStatusPanel'
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

// ── Types ──────────────────────────────────────────────────────────────────

type WizardStep = 'upload' | 'review' | 'conflict' | 'committing' | 'success'

interface AllFlags {
  completions: ParseFlag[]
  dropped: ParseFlag[]
  ranking: ParseFlag[]
  lists: ParseFlag[]
  ratings: ParseFlag[]
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

function FlagList({
  flags,
  limit = 10,
}: {
  flags: ParseFlag[]
  limit?: number
}) {
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
          {f.rowLabel} · {f.field} — {f.message}
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

function UploadStep({
  dateFormat,
  onDateFormatChange,
  onParsed,
}: UploadStepProps) {
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
        const allRankingFlags = result.ranking.flatMap((r) => r.flags)
        const allListFlags = result.lists.flatMap((r) => r.flags)
        const allRatingFlags = result.ratings.flatMap((r) => r.flags)

        onParsed(result, {
          completions: allCompletionFlags,
          dropped: allDroppedFlags,
          ranking: allRankingFlags,
          lists: allListFlags,
          ratings: allRatingFlags,
          duplicates: result.duplicateLevelIds,
        })
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to parse spreadsheet'
        )
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
          <span className="text-xs text-muted-foreground">
            .xlsx files only
          </span>
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
  conflictMode: 'skip' | 'overwrite'
  onConflictModeChange: (m: 'skip' | 'overwrite') => void
  onSkipFlagged: () => void
  onReUpload: () => void
}

function ReviewStep({
  parseResult,
  flags,
  conflictMode,
  onConflictModeChange,
  onSkipFlagged,
  onReUpload,
}: ReviewStepProps) {
  const allFlags = [
    ...flags.completions,
    ...flags.dropped,
    ...flags.ranking,
    ...flags.lists,
    ...flags.ratings,
  ]
  const errorFlags = allFlags.filter((f) => f.severity === 'error')
  const errorFlagsByTab = {
    completions: flags.completions.filter((f) => f.severity === 'error'),
    dropped: flags.dropped.filter((f) => f.severity === 'error'),
    ranking: flags.ranking.filter((f) => f.severity === 'error'),
    lists: flags.lists.filter((f) => f.severity === 'error'),
    ratings: flags.ratings.filter((f) => f.severity === 'error'),
  }
  // Two flavors of warning: a missing level_id we'll resolve by name (the row
  // is fine), and a bad field value we've dropped (the rest of the row imports).
  const isNameOnly = (f: ParseFlag) => f.field === 'level_id'
  const nameOnlyByTab = {
    completions: flags.completions.filter(
      (f) => f.severity === 'warning' && isNameOnly(f)
    ),
    dropped: flags.dropped.filter(
      (f) => f.severity === 'warning' && isNameOnly(f)
    ),
    ranking: flags.ranking.filter(
      (f) => f.severity === 'warning' && isNameOnly(f)
    ),
    lists: flags.lists.filter((f) => f.severity === 'warning' && isNameOnly(f)),
    ratings: flags.ratings.filter(
      (f) => f.severity === 'warning' && isNameOnly(f)
    ),
  }
  const dataWarnByTab = {
    completions: flags.completions.filter(
      (f) => f.severity === 'warning' && !isNameOnly(f)
    ),
    dropped: flags.dropped.filter(
      (f) => f.severity === 'warning' && !isNameOnly(f)
    ),
    ranking: flags.ranking.filter(
      (f) => f.severity === 'warning' && !isNameOnly(f)
    ),
    lists: flags.lists.filter(
      (f) => f.severity === 'warning' && !isNameOnly(f)
    ),
    ratings: flags.ratings.filter(
      (f) => f.severity === 'warning' && !isNameOnly(f)
    ),
  }
  const sumTab = (o: Record<string, ParseFlag[]>) =>
    Object.values(o).reduce((n, arr) => n + arr.length, 0)
  const totalNameOnly = sumTab(nameOnlyByTab)
  const totalDataWarn = sumTab(dataWarnByTab)

  const validCompletions = parseResult.completions.filter(
    (r) =>
      !r.flags.some((f) => f.severity === 'error') &&
      (r.data.levelId || r.data.levelName)
  )
  const validDropped = parseResult.dropped.filter(
    (r) =>
      !r.flags.some((f) => f.severity === 'error') &&
      (r.data.levelId || r.data.levelName)
  )
  const totalRanked = parseResult.ranking.filter(
    (r) =>
      !r.flags.some((f) => f.severity === 'error') && (r.levelId || r.levelName)
  ).length
  const totalListed = parseResult.lists.filter(
    (r) =>
      !r.flags.some((f) => f.severity === 'error') &&
      r.list &&
      (r.levelId || r.levelName)
  ).length
  const totalRated = parseResult.ratings.filter(
    (r) =>
      !r.flags.some((f) => f.severity === 'error') &&
      (r.levelId || r.levelName) &&
      Object.keys(r.scores).length > 0
  ).length
  const totalValid = validCompletions.length + validDropped.length
  const totalSkipped = errorFlags.length + flags.duplicates.length

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
          {validCompletions.length} completions · {validDropped.length} dropped
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
              <p className="text-xs text-muted-foreground font-medium mt-2">
                Completions tab
              </p>
              <FlagList flags={errorFlagsByTab.completions} />
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

      <div>
        <label className="block text-sm font-medium mb-1.5">
          Existing completions
        </label>
        <Select
          value={conflictMode}
          onValueChange={(v) => onConflictModeChange(v as 'skip' | 'overwrite')}
        >
          <SelectTrigger className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="skip">
              Keep existing (review conflicts)
            </SelectItem>
            <SelectItem value="overwrite">
              Overwrite with spreadsheet data
            </SelectItem>
          </SelectContent>
        </Select>
        {conflictMode === 'overwrite' && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
            All existing completions matched by this spreadsheet will be
            replaced.
          </p>
        )}
      </div>

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
  const unresolvedCount = conflicts.filter(
    (c) => !resolutions[c.levelId]
  ).length

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {conflicts.length} level{conflicts.length !== 1 ? 's' : ''} in your
        spreadsheet already have a completion. Choose what to do with each.
      </p>

      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
        <strong>Overwrite</strong> replaces the existing completion entirely
        with the spreadsheet version, including clearing fields the sheet leaves
        blank. This is not a merge.
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
                {c.attempts != null
                  ? ` · ${c.attempts.toLocaleString()} attempts`
                  : ''}
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
  status: ImportStatusResponse
  onClose: () => void
}

function SuccessStep({ status, onClose }: SuccessStepProps) {
  const { committed, updated, skipped, failed } = status.outcomeCounts
  const { rankingResult, collectionsResult: listsResult, ratingsResult } = status

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

// ── Wizard root ────────────────────────────────────────────────────────────

interface ImportWizardProps {
  me: MeData
  onClose: () => void
}

export function ImportWizard({ me, onClose }: ImportWizardProps) {
  const { checkConflicts, startImport } = useImportApi()
  const importStatus = useImportStatus()

  const [step, setStep] = useState<WizardStep>('upload')
  const [dateFormat, setDateFormat] = useState<DateFormat>(
    me.dateFormatPreference as DateFormat
  )
  const [conflictMode, setConflictMode] = useState<'skip' | 'overwrite'>('skip')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [allFlags, setAllFlags] = useState<AllFlags>({
    completions: [],
    dropped: [],
    ranking: [],
    lists: [],
    ratings: [],
    duplicates: [],
  })
  const [conflicts, setConflicts] = useState<ImportConflict[]>([])
  const [resolutions, setResolutions] = useState<
    Record<string, ConflictResolution>
  >({})
  const [progressLabel, setProgressLabel] = useState('')
  const [commitError, setCommitError] = useState<string | null>(null)

  // Progress bar during `committing` is driven by the polled job status once
  // the job exists; before that (conflict-check phase) progressLabel alone
  // carries the message.
  const total = importStatus.data?.totalRows ?? 0
  const processed = importStatus.data?.processedRows ?? 0
  const progress = total > 0 ? (processed / total) * 100 : 0

  // Once the background job finishes (from any tab — this polls shared
  // server state), move from the progress bar to the Done screen.
  useEffect(() => {
    if (step === 'committing' && importStatus.data?.status === 'completed') {
      setStep('success')
    }
    if (step === 'committing' && importStatus.data?.status === 'failed') {
      setCommitError(importStatus.data.error ?? 'Import failed')
    }
  }, [step, importStatus.data])

  // ── Valid rows (excludes error-flagged rows; name-only rows are included) ──
  const validRows = useCallback(
    (result: ParseResult) => ({
      completions: result.completions.filter(
        (r) =>
          !r.flags.some((f) => f.severity === 'error') &&
          (r.data.levelId || r.data.levelName)
      ),
      dropped: result.dropped.filter(
        (r) =>
          !r.flags.some((f) => f.severity === 'error') &&
          (r.data.levelId || r.data.levelName)
      ),
    }),
    []
  )

  // ── Step: upload → review ──────────────────────────────────────────────

  const handleParsed = useCallback((result: ParseResult, flags: AllFlags) => {
    setParseResult(result)
    setAllFlags(flags)
    setStep('review')
  }, [])

  // ── Commit loop ────────────────────────────────────────────────────────

  // Persists the full dataset in one call and hands off to the background
  // worker — progress from here on is read from useImportStatus(), which
  // keeps working even if this drawer gets closed (see the `committing` step
  // render below and the close button next to it).
  const startImportJob = useCallback(
    async (
      completions: ParsedCompletionRow[],
      dropped: ParsedDroppedRow[],
      res: Record<string, ConflictResolution>,
      globalResolution?: ConflictResolution
    ) => {
      setProgressLabel('Starting import…')
      setCommitError(null)

      // Build the flat row list with stable indices.
      const rows: ImportCommitRow[] = [
        ...completions.map((r): ImportCommitRow => {
          // Per-row resolution (from conflict step) takes precedence;
          // fall back to globalResolution (e.g. "overwrite all" mode).
          const resolution =
            (r.data.levelId ? res[r.data.levelId] : undefined) ??
            globalResolution
          return resolution
            ? {
                type: 'completion',
                rowIndex: r.rowIndex,
                data: r.data,
                conflictResolution: resolution,
              }
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

      const rankingRows = (parseResult?.ranking ?? []).filter(
        (r) =>
          !r.flags.some((f) => f.severity === 'error') &&
          (r.levelId || r.levelName)
      )
      const listRows = (parseResult?.lists ?? []).filter(
        (r) =>
          !r.flags.some((f) => f.severity === 'error') &&
          r.list &&
          (r.levelId || r.levelName)
      )
      const ratingRows = (parseResult?.ratings ?? []).filter(
        (r) =>
          !r.flags.some((f) => f.severity === 'error') &&
          (r.levelId || r.levelName) &&
          Object.keys(r.scores).length > 0
      )

      try {
        await startImport({
          rows,
          ...(rankingRows.length > 0
            ? {
                ranking: rankingRows.map((r) => ({
                  levelId: r.levelId,
                  levelName: r.levelName,
                })),
              }
            : {}),
          ...(listRows.length > 0
            ? {
                collections: listRows.map((r) => ({
                  list: r.list as string,
                  levelId: r.levelId,
                  levelName: r.levelName,
                  creator: r.creator,
                  inGameDifficulty: r.inGameDifficulty,
                  position: r.position,
                })),
              }
            : {}),
          ...(ratingRows.length > 0
            ? {
                ratings: ratingRows.map((r) => ({
                  levelId: r.levelId,
                  levelName: r.levelName,
                  creator: r.creator,
                  inGameDifficulty: r.inGameDifficulty,
                  scores: r.scores,
                })),
              }
            : {}),
        })
        setProgressLabel('Importing…')
        void importStatus.refetch()
      } catch (err) {
        setCommitError(
          err instanceof Error ? err.message : 'Failed to start import'
        )
        setStep('review')
      }
    },
    [startImport, parseResult, importStatus]
  )

  // ── Step: review → conflict check / commit ─────────────────────────────

  const handleSkipFlagged = useCallback(async () => {
    if (!parseResult) return

    const { completions, dropped } = validRows(parseResult)

    if (conflictMode === 'overwrite') {
      // Skip conflict check entirely; all completions get overwrite resolution.
      setStep('committing')
      await startImportJob(completions, dropped, {}, 'overwrite')
      return
    }

    // Skip mode: check conflicts for rows with known level IDs first.
    // Name-only rows can't be pre-checked until the server resolves their ID.
    const allLevelIds = [
      ...new Set([
        ...completions.flatMap((r) => (r.data.levelId ? [r.data.levelId] : [])),
        ...dropped.flatMap((r) => (r.data.levelId ? [r.data.levelId] : [])),
      ]),
    ]

    setStep('committing')
    setProgressLabel('Checking for conflicts…')

    try {
      const checkResult =
        allLevelIds.length > 0
          ? await checkConflicts(allLevelIds)
          : { conflicts: [] }
      if (checkResult.conflicts.length > 0) {
        setConflicts(checkResult.conflicts)
        setResolutions({})
        setStep('conflict')
      } else {
        await startImportJob(completions, dropped, {})
      }
    } catch (err) {
      setCommitError(
        err instanceof Error ? err.message : 'Failed to check conflicts'
      )
      setStep('review')
    }
  }, [parseResult, validRows, checkConflicts, startImportJob, conflictMode])

  // ── Step: conflict → commit ────────────────────────────────────────────

  const handleCommitAfterConflict = useCallback(async () => {
    if (!parseResult) return
    const { completions, dropped } = validRows(parseResult)
    setStep('committing')
    await startImportJob(completions, dropped, resolutions)
  }, [parseResult, validRows, resolutions, startImportJob])

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Import spreadsheet</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Bring your completion history into InfernoLog from an existing
          spreadsheet.
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
          conflictMode={conflictMode}
          onConflictModeChange={setConflictMode}
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
          <p className="text-sm text-muted-foreground text-center">
            {importStatus.data?.status === 'running'
              ? `Importing… ${importStatus.data.processedRows} / ${importStatus.data.totalRows} rows`
              : progressLabel}
          </p>
          {commitError && (
            <p className="text-xs text-[var(--color-danger)] text-center">
              {commitError}
            </p>
          )}
          {/* The job runs server-side once started — closing here doesn't
              cancel it; progress remains visible via the persistent toast and
              Settings. */}
          <div className="pt-2 border-t border-[var(--color-border)]">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}

      {step === 'success' && importStatus.data && (
        <SuccessStep status={importStatus.data} onClose={onClose} />
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
