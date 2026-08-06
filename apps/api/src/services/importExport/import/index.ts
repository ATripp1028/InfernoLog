// Spreadsheet import — commit logic behind POST /v1/me/import.
//
// Handles per-row validation, stub level creation, completion and drop writes,
// cross-tab reconciliation (completion + drop for the same level), conflict
// resolution, idempotency via (importJobId, rowIndex) keys, name-based level
// resolution, and GDDL tier autofill.
//
//   levelResolution.ts  name → cached level, stub creation, seed enqueue
//   planWrites.ts       in-memory plan structures + completion planning
//   planEvents.ts       progress/drop planning and existing-event matching
//   processBatch.ts     runs a batch of rows and flushes the planned writes
//   conflicts.ts        the read-only pre-import scan (/import/check)
//
// This file is the module's public surface: everything below is what callers
// outside services/importExport/import are expected to use. The split files
// export more than this to each other, which is internal.

export {
  resolveByName,
  resolveNamesBatch,
  ensureStubLevels,
  enqueueSeedIds,
  type ResolveResult,
} from './levelResolution'
export { processImportJobBatch, commitImportBatch } from './processBatch'
export { checkImportConflicts } from './conflicts'
