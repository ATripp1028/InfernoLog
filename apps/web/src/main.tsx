import './lib/auth'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { defaultShouldDehydrateQuery } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { queryClient } from './lib/queryClient'
import { persister, MAX_AGE } from './lib/persister'
import { gddlSyncStatusQueryKey } from './lib/api/me'
import { AuthProvider } from './context/AuthContext'
import { Toaster } from './components/generic/sonner'
import { routeTree } from './routeTree.gen'
import './index.css'

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: MAX_AGE,
        dehydrateOptions: {
          // gddl-sync is live, ack-gated session state, not cacheable data —
          // persisting it can rehydrate a completed-but-not-yet-acknowledged
          // job on the next load before a fresh fetch confirms the current
          // server state, replaying an already-handled toast (see
          // GddlSyncProvider.tsx).
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) &&
            query.queryKey[0] !== gddlSyncStatusQueryKey[0],
        },
      }}
    >
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster />
      </AuthProvider>
    </PersistQueryClientProvider>
  </StrictMode>
)
