// Spreadsheet import wizard. WizardStep values are strictly ordered (see
// StepIndicator's ORDER map) and only ever move forward automatically —
// upload → review → checking-conflicts → resolve-conflicts → resolve-lists →
// committing → success. checking-conflicts and resolve-conflicts share a
// display slot ("Conflicts"), so finding no field conflicts shows as that
// step being skipped, never revisited; resolve-lists has its own slot
// ("Lists") since it's reachable either directly from checking-conflicts
// (no field conflicts, but a list merge is needed) or after resolve-conflicts
// finishes — either way it's a forward move. The only backward moves are
// explicit user actions (e.g. "Back to review" after an error, "Fix and
// re-upload" from the review step, or "Cancel" out of conflict/list
// resolution).
//
// Upload — file picker + date format selector + client validation.
// Review — flags/counts from parsing.
// Checking-conflicts — one network round trip for every tab's conflict
//   detection (field-level AND list-merge — see /me/import/check).
// Resolve-conflicts — canonical git-merge-style resolution (drop / overwrite
//   / merge, per field or in bulk — see FieldConflictMerge) for whichever
//   rows the check above found conflicting. Internally a linear sequence of
//   sub-steps (Completions → Progress → Dropped → Ratings, empty ones
//   skipped) rather than free-roaming tabs — consistent with the wizard's
//   own top-level "forward only" step model.
// Resolve-lists — three-column git-merge-style ordering resolution (see
//   ListMergeBoard) for whichever collections (and, in a later phase,
//   Ranking) the check found genuinely order-conflicting. Also a linear
//   sequence of sub-steps, one per touched collection.
// Committing — progress bar while batches are sent.
// Success — final report.

import { useState, useCallback, useId, useEffect, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  useImportApi,
  useImportStatus,
  importStatusQueryKey,
} from '@/lib/api/import'
import type {
  ImportRowConflict,
  ImportRatingConflict,
  ImportListMerge,
  ImportCommitRow,
  ImportCheckResponse,
  ImportStatusResponse,
} from '@/lib/api/import'
import { ImportStatusPanel } from './ImportStatusPanel'
import {
  FieldConflictMerge,
  type GroupResolution,
} from './FieldConflictMerge'
import { ListMergeBoard } from './listMerge/ListMergeBoard'
import {
  parseSpreadsheet,
  type DateFormat,
  type ParseResult,
  type ParseFlag,
  type ParsedCompletionRow,
  type ParsedProgressRow,
  type ParsedDroppedRow,
  type ParsedRatingRow,
} from './parseSpreadsheet'
import { downloadTemplate } from './generateTemplate'
import type { MeData } from '@/lib/api/me'

// ── Types ──────────────────────────────────────────────────────────────────

// checking-conflicts is a distinct state from committing (see StepIndicator's
// ORDER map) — it's the network round trip that decides where the wizard
// goes next, so it must sit between review and resolve-conflicts/resolve-lists,
// never share committing's step slot.
type WizardStep =
  | 'upload'
  | 'review'
  | 'checking-conflicts'
  | 'resolve-conflicts'
  | 'resolve-lists'
  | 'committing'
  | 'success'

// The resolve-conflicts step's internal sequence — a sub-step is skipped
// when its conflict list is empty, same "skip what's empty" rule as the
// top-level wizard steps.
const CONFLICT_SUB_STEP_ORDER = [
  'completions',
  'progress',
  'dropped',
  'ratings',
] as const
type ConflictSubStep = (typeof CONFLICT_SUB_STEP_ORDER)[number]

// resolvedListOrders key for the single global ranking merge (once Phase 5
// populates rankingMerge) — collections are keyed by their own display name,
// which can never collide with this sentinel.
const RANKING_MERGE_KEY = '__ranking__'

// Mirrors apps/api/src/services/importCollections.ts's classifyCollection —
// only the display-name half, since the wizard just needs to know which raw
// sheet rows belong to the same target collection as an already-resolved
// merge result (matched against ImportListMerge.list), not the full
// key/type/create-on-demand logic the backend owns.
function classifyCollectionName(raw: string): string {
  const k = raw.toLowerCase().replace(/[\s_-]+/g, '')
  if (k === 'wanttobeat') return 'Want to Beat'
  if (['favorites', 'favourites', 'favorite', 'favourite'].includes(k))
    return 'Favorites'
  if (
    [
      'leastfavorites',
      'leastfavourites',
      'leastfavorite',
      'leastfavourite',
    ].includes(k)
  )
    return 'Least Favorites'
  return raw.trim()
}

// checkConflicts is skipped entirely when there's nothing to check (e.g. an
// import with no Completions/Progress/Dropped rows at all).
const EMPTY_CHECK_RESULT: ImportCheckResponse = {
  completionConflicts: [],
  progressConflicts: [],
  progressDuplicates: [],
  droppedConflicts: [],
  droppedDuplicates: [],
  ratingConflicts: [],
  collectionsMerge: [],
  rankingMerge: null,
}

// Shared shape between Completions/Progress/Dropped conflicts — FieldConflictMerge
// only needs the group scaffolding, not the levelId/matchedId bookkeeping.
function conflictsToGroups(conflicts: ImportRowConflict[]) {
  return conflicts.map((c) => ({
    groupId: String(c.rowIndex),
    title: c.levelName ?? `Level ${c.levelId}`,
    subtitle: `ID ${c.levelId}`,
    fields: c.fields.map((f) => ({
      field: f.field,
      existingValue: f.existingValue,
      importedValue: f.importedValue,
    })),
  }))
}

// Ratings conflicts are keyed by (levelId, categoryName) rather than
// rowIndex — a rating "row" in the sheet bundles every category for one
// level into a single scores map, so a conflict on one category doesn't
// correspond to a whole row the way it does for the other three tabs.
function ratingConflictGroupId(conflict: ImportRatingConflict): string {
  return `${conflict.levelId}::${conflict.categoryName}`
}

function ratingConflictsToGroups(conflicts: ImportRatingConflict[]) {
  return conflicts.map((c) => ({
    groupId: ratingConflictGroupId(c),
    title: c.levelName ?? `Level ${c.levelId}`,
    subtitle: c.categoryName,
    fields: [
      {
        field: 'score',
        existingValue: c.existingScore,
        importedValue: c.importedScore,
      },
    ],
  }))
}

// Shared between the /check request and the final /start payload — both need
// the same "which rating rows are actually importable" filter.
function getValidRatingRows(parseResult: ParseResult | null): ParsedRatingRow[] {
  return (parseResult?.ratings ?? []).filter(
    (r) =>
      !r.flags.some((f) => f.severity === 'error') &&
      (r.levelId || r.levelName) &&
      Object.keys(r.scores).length > 0
  )
}

interface AllFlags {
  completions: ParseFlag[]
  progress: ParseFlag[]
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

function StepIndicator({
  step,
  skipConflictCheck,
}: {
  step: WizardStep
  skipConflictCheck?: boolean
}) {
  const steps: { id: WizardStep | 'done'; label: string }[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'review', label: 'Review' },
    ...(skipConflictCheck
      ? []
      : [
          { id: 'resolve-conflicts' as const, label: 'Conflicts' },
          { id: 'resolve-lists' as const, label: 'Lists' },
        ]),
    { id: 'committing', label: 'Import' },
    { id: 'success', label: 'Done' },
  ]

  // checking-conflicts shares the "Conflicts" slot with resolve-conflicts
  // itself — it's the in-flight check that decides whether the resolve step
  // is needed at all, so it must render as the same indicator position
  // rather than briefly flashing "Import" as current before possibly
  // stepping back. resolve-lists gets its own slot: it's reachable either
  // directly from checking-conflicts (no field conflicts, but a list merge
  // is needed) or after resolve-conflicts finishes — both are forward moves
  // since its order (3) is greater than checking-conflicts/resolve-conflicts's (2).
  const ORDER: Record<WizardStep | 'done', number> = {
    upload: 0,
    review: 1,
    'checking-conflicts': 2,
    'resolve-conflicts': 2,
    'resolve-lists': 3,
    committing: 4,
    success: 5,
    done: 6,
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
  const [isDragging, setIsDragging] = useState(false)
  // dragenter/dragleave fire on every child the pointer crosses (per the
  // HTML5 DnD spec), not just when the pointer enters/exits the label as a
  // whole — count nesting depth instead of toggling on every event so the
  // highlight doesn't flicker while dragging across the label's own children.
  const dragDepth = useRef(0)

  // The drop zone below handles its own dragover/drop, but a drop anywhere
  // else on the page (e.g. a few pixels outside the dashed box) would
  // otherwise fall through to the browser's default "navigate to file"
  // behavior, discarding the whole app session. Swallow it at the window
  // level for as long as this step is mounted.
  useEffect(() => {
    const preventDefault = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', preventDefault)
    window.addEventListener('drop', preventDefault)
    return () => {
      window.removeEventListener('dragover', preventDefault)
      window.removeEventListener('drop', preventDefault)
    }
  }, [])

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      setParsing(true)
      try {
        const buffer = await file.arrayBuffer()
        const result = parseSpreadsheet(buffer, dateFormat)

        const allCompletionFlags = result.completions.flatMap((r) => r.flags)
        const allProgressFlags = result.progress.flatMap((r) => r.flags)
        const allDroppedFlags = result.dropped.flatMap((r) => r.flags)
        const allRankingFlags = result.ranking.flatMap((r) => r.flags)
        const allListFlags = result.lists.flatMap((r) => r.flags)
        const allRatingFlags = result.ratings.flatMap((r) => r.flags)

        onParsed(result, {
          completions: allCompletionFlags,
          progress: allProgressFlags,
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
          onDragEnter={(e) => {
            e.preventDefault()
            dragDepth.current += 1
            if (!parsing) setIsDragging(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            dragDepth.current = Math.max(0, dragDepth.current - 1)
            if (dragDepth.current === 0) setIsDragging(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            dragDepth.current = 0
            setIsDragging(false)
            if (parsing) return
            const f = e.dataTransfer.files?.[0]
            if (f) void handleFile(f)
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed',
            'border-[var(--color-border)] bg-[var(--color-bg-surface)] p-10 cursor-pointer',
            'hover:border-[var(--color-primary)] hover:bg-accent transition-colors text-center',
            isDragging && 'border-[var(--color-primary)] bg-accent',
            parsing && 'pointer-events-none opacity-60'
          )}
        >
          <span className="text-2xl">📂</span>
          <span className="text-sm text-foreground font-medium">
            {parsing
              ? 'Parsing…'
              : isDragging
                ? 'Drop to upload'
                : 'Click to select or drag and drop'}
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
  onSkipFlagged: () => void
  onReUpload: () => void
}

function ReviewStep({
  parseResult,
  flags,
  onSkipFlagged,
  onReUpload,
}: ReviewStepProps) {
  const allFlags = [
    ...flags.completions,
    ...flags.progress,
    ...flags.dropped,
    ...flags.ranking,
    ...flags.lists,
    ...flags.ratings,
  ]
  const errorFlags = allFlags.filter((f) => f.severity === 'error')
  const errorFlagsByTab = {
    completions: flags.completions.filter((f) => f.severity === 'error'),
    progress: flags.progress.filter((f) => f.severity === 'error'),
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
    progress: flags.progress.filter(
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
    progress: flags.progress.filter(
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
  const validProgress = parseResult.progress.filter(
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
  const totalValid =
    validCompletions.length + validProgress.length + validDropped.length
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

// ── Wizard root ────────────────────────────────────────────────────────────

interface ImportWizardProps {
  me: MeData
  onClose: () => void
  // Onboarding: a brand-new account can't already have completions, so
  // there's nothing to conflict with — skips the conflict-check round trip,
  // the Conflicts step, and the resolution UI entirely rather than showing
  // UI for a case that can never occur.
  skipConflictCheck?: boolean
}

export function ImportWizard({
  me,
  onClose,
  skipConflictCheck = false,
}: ImportWizardProps) {
  const { checkConflicts, startImport } = useImportApi()
  const importStatus = useImportStatus()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<WizardStep>('upload')
  const [dateFormat, setDateFormat] = useState<DateFormat>(
    me.dateFormatPreference as DateFormat
  )
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [allFlags, setAllFlags] = useState<AllFlags>({
    completions: [],
    progress: [],
    dropped: [],
    ranking: [],
    lists: [],
    ratings: [],
    duplicates: [],
  })
  const [completionConflicts, setCompletionConflicts] = useState<
    ImportRowConflict[]
  >([])
  const [progressConflicts, setProgressConflicts] = useState<
    ImportRowConflict[]
  >([])
  const [droppedConflicts, setDroppedConflicts] = useState<
    ImportRowConflict[]
  >([])
  const [ratingConflicts, setRatingConflicts] = useState<
    ImportRatingConflict[]
  >([])
  const [conflictSubStep, setConflictSubStep] =
    useState<ConflictSubStep>('completions')
  const [completionResolutions, setCompletionResolutions] = useState<
    Map<string, GroupResolution>
  >(new Map())
  const [progressResolutions, setProgressResolutions] = useState<
    Map<string, GroupResolution>
  >(new Map())
  const [droppedResolutions, setDroppedResolutions] = useState<
    Map<string, GroupResolution>
  >(new Map())
  const [ratingResolutions, setRatingResolutions] = useState<
    Map<string, GroupResolution>
  >(new Map())
  const [collectionsMerge, setCollectionsMerge] = useState<ImportListMerge[]>(
    []
  )
  const [rankingMerge, setRankingMerge] = useState<ImportListMerge | null>(
    null
  )
  const [listMergeIndex, setListMergeIndex] = useState(0)
  const [resolvedListOrders, setResolvedListOrders] = useState<
    Map<string, string[]>
  >(new Map())
  const [progressLabel, setProgressLabel] = useState('')
  const [commitError, setCommitError] = useState<string | null>(null)

  // The resolve-lists step's linear sequence — one sub-step per touched
  // collection (from the check response, already filtered to hasConflict
  // ones only), plus Ranking last if present. Derived rather than stored:
  // collectionsMerge/rankingMerge only change once, right after the check
  // call, and stay fixed for the rest of the resolve-lists sub-flow.
  const listMergeQueue = useMemo(
    () => [
      ...collectionsMerge.map((m) => ({ key: m.list!, merge: m })),
      ...(rankingMerge ? [{ key: RANKING_MERGE_KEY, merge: rankingMerge }] : []),
    ],
    [collectionsMerge, rankingMerge]
  )

  // Progress bar during `committing` is driven by the polled job status once
  // the job exists; before that (while startImport is still being called),
  // progressLabel alone carries the message.
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
      progress: result.progress.filter(
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
      progressRows: ParsedProgressRow[],
      dropped: ParsedDroppedRow[],
      completionResolutions: Map<string, GroupResolution>,
      progressResolutions: Map<string, GroupResolution>,
      droppedResolutions: Map<string, GroupResolution>,
      ratingResolutions: Map<string, GroupResolution>,
      // Collection name (or RANKING_MERGE_KEY) → the user-merged final
      // order, for whichever lists went through resolve-lists. A list not
      // in this map never needed merging — its original sheet rows are
      // sent unchanged.
      listOrders: Map<string, string[]>
    ) => {
      // Wipe any cached status from a previous job *before* the network call
      // — the `committing` step renders (and its completion-detection effect
      // runs) on this same tick, and if a prior import's cached status was
      // still 'completed', that effect would read it as this job already
      // being done and jump straight to the success screen, when the new job
      // hasn't even reached the server yet. `refetch()` below then repopulates
      // it with the real (freshly-created, 'running') status once /start
      // returns.
      queryClient.setQueryData(importStatusQueryKey, null)
      setProgressLabel('Starting import…')
      setCommitError(null)

      // A resolved progress/dropped conflict must fold the matched entry's id
      // back onto progressId/dropId so the server's ordinary id round-trip
      // path (not the derived-key fallback) picks up the resolution.
      const progressMatchedIds = new Map(
        progressConflicts.map((c) => [c.rowIndex, c.matchedId])
      )
      const droppedMatchedIds = new Map(
        droppedConflicts.map((c) => [c.rowIndex, c.matchedId])
      )

      // Build the flat row list with stable indices.
      const rows: ImportCommitRow[] = [
        ...completions.map((r): ImportCommitRow => {
          // Resolved during resolve-conflicts, keyed by rowIndex (levelId
          // isn't unique enough on its own once name-only rows are involved).
          const resolved = completionResolutions.get(String(r.rowIndex))
          return resolved
            ? {
                type: 'completion',
                rowIndex: r.rowIndex,
                // `values` only carries fields whose winner wasn't "imported"
                // — those already hold the correct value in r.data.
                data: { ...r.data, ...resolved.values },
                resolution: resolved.resolution,
              }
            : { type: 'completion', rowIndex: r.rowIndex, data: r.data }
        }),
        ...dropped.map((r): ImportCommitRow => {
          const resolved = droppedResolutions.get(String(r.rowIndex))
          if (!resolved) {
            return {
              type: 'dropped',
              rowIndex: r.rowIndex + 100000, // offset to avoid collision with completion indices
              data: r.data,
            }
          }
          const matchedId = droppedMatchedIds.get(r.rowIndex)
          return {
            type: 'dropped',
            rowIndex: r.rowIndex + 100000,
            data: {
              ...r.data,
              ...resolved.values,
              ...(matchedId ? { dropId: matchedId } : {}),
            },
            resolution: resolved.resolution,
          }
        }),
        ...progressRows.map((r): ImportCommitRow => {
          const resolved = progressResolutions.get(String(r.rowIndex))
          if (!resolved) {
            return {
              type: 'progress',
              rowIndex: r.rowIndex + 200000, // offset to avoid collision with completion/dropped indices
              data: r.data,
            }
          }
          const matchedId = progressMatchedIds.get(r.rowIndex)
          return {
            type: 'progress',
            rowIndex: r.rowIndex + 200000,
            data: {
              ...r.data,
              ...resolved.values,
              ...(matchedId ? { progressId: matchedId } : {}),
            },
            resolution: resolved.resolution,
          }
        }),
      ]

      // Ranking: the resolved merge order (if resolve-lists produced one)
      // wins outright — it already represents the user's final say — else
      // fall back to the sheet's own rows unchanged (no merge was needed).
      const resolvedRankingOrder = listOrders.get(RANKING_MERGE_KEY)
      const rankingEntries = resolvedRankingOrder
        ? resolvedRankingOrder.map((levelId) => ({
            levelId,
            levelName: null as string | null,
          }))
        : (parseResult?.ranking ?? [])
            .filter(
              (r) =>
                !r.flags.some((f) => f.severity === 'error') &&
                (r.levelId || r.levelName)
            )
            .map((r) => ({ levelId: r.levelId, levelName: r.levelName }))

      // Lists/Collections: same idea, but per-collection — a sheet can touch
      // several collections and only some of them needed merging. Rows for a
      // collection with a resolved order are dropped from the original sheet
      // rows and replaced by the resolved order's synthesized rows.
      const resolvedCollectionNames = new Set(
        [...listOrders.keys()].filter((k) => k !== RANKING_MERGE_KEY)
      )
      const untouchedListRows = (parseResult?.lists ?? [])
        .filter(
          (r) =>
            !r.flags.some((f) => f.severity === 'error') &&
            r.list &&
            (r.levelId || r.levelName) &&
            !resolvedCollectionNames.has(classifyCollectionName(r.list!))
        )
        .map((r) => ({
          list: r.list as string,
          levelId: r.levelId,
          levelName: r.levelName,
          creator: r.creator,
          inGameDifficulty: r.inGameDifficulty,
          position: r.position,
        }))
      const resolvedListEntries = [...listOrders.entries()]
        .filter(([key]) => key !== RANKING_MERGE_KEY)
        .flatMap(([listName, order]) =>
          order.map((levelId, i) => ({
            list: listName,
            levelId,
            levelName: null as string | null,
            creator: null as string | null,
            inGameDifficulty: null as string | null,
            position: i,
          }))
        )
      const listEntries = [...untouchedListRows, ...resolvedListEntries]
      // Apply resolved rating conflicts before sending: 'drop' removes that
      // one category from this level's scores (leaving the existing value
      // untouched); a resolved 'score' override replaces it; everything else
      // (no resolution — never conflicted, or resolution left at "imported")
      // passes through as originally parsed. A row a drop leaves with no
      // categories left is dropped entirely — nothing left to send.
      const ratingRows = getValidRatingRows(parseResult)
        .map((r) => {
          if (!r.levelId || ratingResolutions.size === 0) return r
          const scores = { ...r.scores }
          for (const categoryName of Object.keys(r.scores)) {
            const resolved = ratingResolutions.get(
              `${r.levelId}::${categoryName}`
            )
            if (!resolved) continue
            if (resolved.resolution === 'drop') {
              delete scores[categoryName]
            } else if (typeof resolved.values.score === 'number') {
              scores[categoryName] = resolved.values.score
            }
          }
          return { ...r, scores }
        })
        .filter((r) => Object.keys(r.scores).length > 0)

      try {
        await startImport({
          rows,
          ...(rankingEntries.length > 0 ? { ranking: rankingEntries } : {}),
          ...(listEntries.length > 0 ? { collections: listEntries } : {}),
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
        // Stay on `committing` rather than snapping back to review — the
        // step indicator must never revisit an earlier step automatically.
        // The committing render shows this error with an explicit "Back to
        // review" button so any backward move is a deliberate user action.
        setCommitError(
          err instanceof Error ? err.message : 'Failed to start import'
        )
      }
    },
    [
      startImport,
      parseResult,
      importStatus,
      progressConflicts,
      droppedConflicts,
      queryClient,
    ]
  )

  // ── Step: review → conflict check / commit ─────────────────────────────

  // First non-empty sub-step in CONFLICT_SUB_STEP_ORDER, or null if every
  // conflict list is empty (nothing to resolve at all).
  const firstConflictSubStep = (
    completion: ImportRowConflict[],
    progress: ImportRowConflict[],
    dropped: ImportRowConflict[],
    ratings: ImportRatingConflict[]
  ): ConflictSubStep | null => {
    if (completion.length > 0) return 'completions'
    if (progress.length > 0) return 'progress'
    if (dropped.length > 0) return 'dropped'
    if (ratings.length > 0) return 'ratings'
    return null
  }

  const handleSkipFlagged = useCallback(async () => {
    if (!parseResult) return

    const {
      completions,
      progress: progressRows,
      dropped,
    } = validRows(parseResult)
    const ratingRows = getValidRatingRows(parseResult)
    const rankingRows = (parseResult.ranking ?? []).filter(
      (r) =>
        !r.flags.some((f) => f.severity === 'error') &&
        (r.levelId || r.levelName)
    )
    const listRows = (parseResult.lists ?? []).filter(
      (r) =>
        !r.flags.some((f) => f.severity === 'error') &&
        r.list &&
        (r.levelId || r.levelName)
    )

    if (skipConflictCheck) {
      // New account (onboarding) — there can be no existing completions to
      // conflict with, so there's nothing to check.
      setStep('committing')
      await startImportJob(
        completions,
        progressRows,
        dropped,
        new Map(),
        new Map(),
        new Map(),
        new Map(),
        new Map()
      )
      return
    }

    setStep('checking-conflicts')
    setCommitError(null)

    try {
      const hasRows =
        completions.length > 0 ||
        dropped.length > 0 ||
        progressRows.length > 0 ||
        ratingRows.length > 0 ||
        rankingRows.length > 0 ||
        listRows.length > 0
      const checkResult = hasRows
        ? await checkConflicts({
            completions: completions.map((r) => ({
              rowIndex: r.rowIndex,
              data: r.data,
            })),
            dropped: dropped.map((r) => ({
              rowIndex: r.rowIndex,
              data: r.data,
            })),
            progress: progressRows.map((r) => ({
              rowIndex: r.rowIndex,
              data: r.data,
            })),
            ratings: ratingRows.map((r) => ({
              levelId: r.levelId,
              levelName: r.levelName,
              creator: r.creator,
              inGameDifficulty: r.inGameDifficulty,
              scores: r.scores,
            })),
            ranking: rankingRows.map((r) => ({
              levelId: r.levelId,
              levelName: r.levelName,
            })),
            collections: listRows.map((r) => ({
              list: r.list as string,
              levelId: r.levelId,
              levelName: r.levelName,
              creator: r.creator,
              inGameDifficulty: r.inGameDifficulty,
              position: r.position,
            })),
          })
        : EMPTY_CHECK_RESULT

      setCompletionConflicts(checkResult.completionConflicts)
      setProgressConflicts(checkResult.progressConflicts)
      setDroppedConflicts(checkResult.droppedConflicts)
      setRatingConflicts(checkResult.ratingConflicts)
      setCollectionsMerge(checkResult.collectionsMerge)
      setRankingMerge(checkResult.rankingMerge)

      const firstSubStep = firstConflictSubStep(
        checkResult.completionConflicts,
        checkResult.progressConflicts,
        checkResult.droppedConflicts,
        checkResult.ratingConflicts
      )
      const hasListMerges =
        checkResult.collectionsMerge.length > 0 || checkResult.rankingMerge != null

      if (firstSubStep) {
        setConflictSubStep(firstSubStep)
        setCompletionResolutions(new Map())
        setProgressResolutions(new Map())
        setDroppedResolutions(new Map())
        setRatingResolutions(new Map())
        setStep('resolve-conflicts')
      } else if (hasListMerges) {
        setListMergeIndex(0)
        setResolvedListOrders(new Map())
        setStep('resolve-lists')
      } else {
        setStep('committing')
        await startImportJob(
          completions,
          progressRows,
          dropped,
          new Map(),
          new Map(),
          new Map(),
          new Map(),
          new Map()
        )
      }
    } catch (err) {
      // Stay on `checking-conflicts` — see the comment in startImportJob's
      // catch block for why this must not auto-navigate backward.
      setCommitError(
        err instanceof Error ? err.message : 'Failed to check conflicts'
      )
    }
  }, [parseResult, validRows, checkConflicts, startImportJob, skipConflictCheck])

  // ── Step: resolve-conflicts sub-steps → commit ─────────────────────────
  //
  // Each sub-step's onResolved stores its resolutions, then either advances
  // to the next non-empty sub-step or — if it was the last one — commits
  // with everything accumulated so far. Reads sibling resolutions from
  // component state rather than a param: by the time the LAST sub-step's
  // handler fires, every earlier sub-step has already gone through its own
  // setState + re-render, so the values are current.

  const finishConflictResolution = useCallback(
    async (
      completionRes: Map<string, GroupResolution>,
      progressRes: Map<string, GroupResolution>,
      droppedRes: Map<string, GroupResolution>,
      ratingRes: Map<string, GroupResolution>
    ) => {
      if (!parseResult) return
      // A list merge still needs resolving — hand off to resolve-lists
      // rather than committing yet. That step reads these four resolutions
      // back from state once IT finishes (see finishListMergeResolution) —
      // by then they've long since landed via the setState calls the
      // sub-step handlers below already made before calling this function.
      if (listMergeQueue.length > 0) {
        setListMergeIndex(0)
        setResolvedListOrders(new Map())
        setStep('resolve-lists')
        return
      }
      const {
        completions,
        progress: progressRows,
        dropped,
      } = validRows(parseResult)
      setStep('committing')
      await startImportJob(
        completions,
        progressRows,
        dropped,
        completionRes,
        progressRes,
        droppedRes,
        ratingRes,
        new Map()
      )
    },
    [parseResult, validRows, startImportJob, listMergeQueue]
  )

  // ── Step: resolve-lists sub-steps → commit ─────────────────────────────

  const finishListMergeResolution = useCallback(
    async (listOrders: Map<string, string[]>) => {
      if (!parseResult) return
      const {
        completions,
        progress: progressRows,
        dropped,
      } = validRows(parseResult)
      setStep('committing')
      await startImportJob(
        completions,
        progressRows,
        dropped,
        completionResolutions,
        progressResolutions,
        droppedResolutions,
        ratingResolutions,
        listOrders
      )
    },
    [
      parseResult,
      validRows,
      startImportJob,
      completionResolutions,
      progressResolutions,
      droppedResolutions,
      ratingResolutions,
    ]
  )

  const handleListMergeConfirmed = useCallback(
    (finalOrder: string[]) => {
      const current = listMergeQueue[listMergeIndex]
      if (!current) return
      const nextOrders = new Map(resolvedListOrders).set(current.key, finalOrder)
      setResolvedListOrders(nextOrders)
      if (listMergeIndex + 1 < listMergeQueue.length) {
        setListMergeIndex((i) => i + 1)
      } else {
        void finishListMergeResolution(nextOrders)
      }
    },
    [listMergeQueue, listMergeIndex, resolvedListOrders, finishListMergeResolution]
  )

  const handleListMergeCancelled = useCallback(() => {
    setCollectionsMerge([])
    setRankingMerge(null)
    setListMergeIndex(0)
    setResolvedListOrders(new Map())
    setStep('review')
  }, [])

  const nextConflictSubStep = useCallback(
    (from: ConflictSubStep): ConflictSubStep | null => {
      const idx = CONFLICT_SUB_STEP_ORDER.indexOf(from)
      for (let i = idx + 1; i < CONFLICT_SUB_STEP_ORDER.length; i++) {
        const step = CONFLICT_SUB_STEP_ORDER[i]!
        if (step === 'progress' && progressConflicts.length > 0) return step
        if (step === 'dropped' && droppedConflicts.length > 0) return step
        if (step === 'ratings' && ratingConflicts.length > 0) return step
      }
      return null
    },
    [progressConflicts, droppedConflicts, ratingConflicts]
  )

  const handleCompletionConflictsResolved = useCallback(
    (resolved: Map<string, GroupResolution>) => {
      setCompletionResolutions(resolved)
      const next = nextConflictSubStep('completions')
      if (next) setConflictSubStep(next)
      else
        void finishConflictResolution(
          resolved,
          progressResolutions,
          droppedResolutions,
          ratingResolutions
        )
    },
    [
      nextConflictSubStep,
      progressResolutions,
      droppedResolutions,
      ratingResolutions,
      finishConflictResolution,
    ]
  )

  const handleProgressConflictsResolved = useCallback(
    (resolved: Map<string, GroupResolution>) => {
      setProgressResolutions(resolved)
      const next = nextConflictSubStep('progress')
      if (next) setConflictSubStep(next)
      else
        void finishConflictResolution(
          completionResolutions,
          resolved,
          droppedResolutions,
          ratingResolutions
        )
    },
    [
      nextConflictSubStep,
      completionResolutions,
      droppedResolutions,
      ratingResolutions,
      finishConflictResolution,
    ]
  )

  const handleDroppedConflictsResolved = useCallback(
    (resolved: Map<string, GroupResolution>) => {
      setDroppedResolutions(resolved)
      const next = nextConflictSubStep('dropped')
      if (next) setConflictSubStep(next)
      else
        void finishConflictResolution(
          completionResolutions,
          progressResolutions,
          resolved,
          ratingResolutions
        )
    },
    [
      nextConflictSubStep,
      completionResolutions,
      progressResolutions,
      ratingResolutions,
      finishConflictResolution,
    ]
  )

  const handleRatingConflictsResolved = useCallback(
    (resolved: Map<string, GroupResolution>) => {
      // 'ratings' is always last in CONFLICT_SUB_STEP_ORDER — nothing to
      // advance to.
      setRatingResolutions(resolved)
      void finishConflictResolution(
        completionResolutions,
        progressResolutions,
        droppedResolutions,
        resolved
      )
    },
    [
      completionResolutions,
      progressResolutions,
      droppedResolutions,
      finishConflictResolution,
    ]
  )

  const handleConflictsCancelled = useCallback(() => {
    setCompletionConflicts([])
    setProgressConflicts([])
    setDroppedConflicts([])
    setRatingConflicts([])
    setCollectionsMerge([])
    setRankingMerge(null)
    setStep('review')
  }, [])

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

      <StepIndicator step={step} skipConflictCheck={skipConflictCheck} />

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

      {step === 'checking-conflicts' && (
        <div className="space-y-3 py-4">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Checking for conflicts…
          </div>
          {commitError && (
            <div className="space-y-2 text-center">
              <p className="text-xs text-[var(--color-danger)]">
                {commitError}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCommitError(null)
                  setStep('review')
                }}
              >
                Back to review
              </Button>
            </div>
          )}
        </div>
      )}

      {step === 'resolve-conflicts' && conflictSubStep === 'completions' && (
        <FieldConflictMerge
          tab="completion"
          groups={conflictsToGroups(completionConflicts)}
          onResolved={handleCompletionConflictsResolved}
          onCancel={handleConflictsCancelled}
        />
      )}

      {step === 'resolve-conflicts' && conflictSubStep === 'progress' && (
        <FieldConflictMerge
          tab="progress"
          groups={conflictsToGroups(progressConflicts)}
          onResolved={handleProgressConflictsResolved}
          onCancel={handleConflictsCancelled}
        />
      )}

      {step === 'resolve-conflicts' && conflictSubStep === 'dropped' && (
        <FieldConflictMerge
          tab="dropped"
          groups={conflictsToGroups(droppedConflicts)}
          onResolved={handleDroppedConflictsResolved}
          onCancel={handleConflictsCancelled}
        />
      )}

      {step === 'resolve-conflicts' && conflictSubStep === 'ratings' && (
        <FieldConflictMerge
          tab="rating"
          groups={ratingConflictsToGroups(ratingConflicts)}
          onResolved={handleRatingConflictsResolved}
          onCancel={handleConflictsCancelled}
        />
      )}

      {step === 'resolve-lists' &&
        listMergeQueue[listMergeIndex] &&
        (() => {
          const current = listMergeQueue[listMergeIndex]!
          return (
            <ListMergeBoard
              key={current.key}
              title={current.key === RANKING_MERGE_KEY ? 'Ranking' : current.key}
              mergedSeed={current.merge.mergedSeed}
              importedRemainder={current.merge.importedRemainder}
              existingRemainder={current.merge.existingRemainder}
              onConfirm={handleListMergeConfirmed}
              onCancel={handleListMergeCancelled}
            />
          )
        })()}

      {step === 'committing' && (
        <div className="space-y-3 py-4">
          <ProgressBar value={progress} />
          <p className="text-sm text-muted-foreground text-center">
            {importStatus.data?.status === 'running'
              ? `Importing… ${importStatus.data.processedRows} / ${importStatus.data.totalRows} rows`
              : progressLabel}
          </p>
          {commitError && (
            <div className="space-y-2 text-center">
              <p className="text-xs text-[var(--color-danger)]">
                {commitError}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCommitError(null)
                  setStep('review')
                }}
              >
                Back to review
              </Button>
            </div>
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

      {/* resolve-conflicts/resolve-lists each have their own Cancel (back to
          review) inside FieldConflictMerge/ListMergeBoard — showing this
          generic one too would put two differently-behaving "Cancel"
          buttons next to each other. */}
      {step !== 'success' &&
        step !== 'committing' &&
        step !== 'resolve-conflicts' &&
        step !== 'resolve-lists' && (
          <div className="pt-2 border-t border-[var(--color-border)]">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </div>
        )}
    </div>
  )
}
