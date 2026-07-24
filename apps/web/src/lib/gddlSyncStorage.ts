// Tracks the id of the most recent GDDL sync job this browser has already
// shown a completion/failure toast and invalidated caches for. GET
// /v1/me/gddl-sync always returns the user's most-recent job — even long
// after it finished, since GddlSyncJob rows are never deleted — so without
// this a fresh page load would re-toast and re-invalidate for a sync that
// already completed in a previous session.
const KEY = 'infernolog:gddl-sync-handled-job'

export function getHandledGddlSyncJobId(): string | null {
  return localStorage.getItem(KEY)
}

export function setHandledGddlSyncJobId(jobId: string): void {
  localStorage.setItem(KEY, jobId)
}

export function clearHandledGddlSyncJobId(): void {
  localStorage.removeItem(KEY)
}
