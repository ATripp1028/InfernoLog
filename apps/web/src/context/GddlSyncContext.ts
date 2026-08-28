import { createContext, useContext } from 'react'

interface GddlSyncContextValue {
  /** True while a GDDL sync job is queued or running for this user. */
  isSyncing: boolean
}

/**
 * The app-wide GDDL sync job state, or null outside its provider.
 *
 * Lives in `context/` rather than beside the provider because the provider is
 * mounted once in the authenticated shell while its only reader — the GDDL
 * connection editor — is a shared component in `components/inputs/`.
 * `GddlSyncProvider` (in `features/settings`) is the only thing that writes
 * to it; everything else goes through {@link useGddlSyncContext}.
 */
export const GddlSyncContext = createContext<GddlSyncContextValue | null>(null)

/**
 * The app-wide GDDL sync job state. Throws outside `GddlSyncProvider`.
 */
export function useGddlSyncContext(): GddlSyncContextValue {
  const ctx = useContext(GddlSyncContext)
  if (!ctx) {
    throw new Error('useGddlSyncContext must be used within GddlSyncProvider')
  }
  return ctx
}
