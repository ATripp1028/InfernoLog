import './lib/sentry'
import './lib/auth'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { defaultShouldDehydrateQuery } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { Sentry } from './lib/sentry'
import { queryClient } from './lib/queryClient'
import { persister, MAX_AGE } from './lib/persister'
import { gddlSyncStatusQueryKey } from './lib/api/me'
import { AuthProvider } from './context/AuthContext'
import { Toaster } from './components/generic/sonner'
import { ErrorFallback } from './components/shell/ErrorFallback'
import { RouteErrorFallback } from './components/shell/RouteErrorFallback'
import { routeTree } from './routeTree.gen'
import './index.css'

// `defaultErrorComponent` covers every route at once, so a new route cannot
// forget its boundary. The router catches these itself, which is why
// RouteErrorFallback has to report them — see that file.
const router = createRouter({
  routeTree,
  defaultErrorComponent: RouteErrorFallback,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/*
      Catches what the router's own boundaries cannot: the providers above
      it. AuthProvider is the one that matters — it calls fetchAuthSession
      on mount, outside every route boundary, so a throw there took the
      whole app to a white screen before this existed.
    */}
    <Sentry.ErrorBoundary
      fallback={({ error, eventId }) => (
        <ErrorFallback error={error} eventId={eventId} />
      )}
    >
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
    </Sentry.ErrorBoundary>
  </StrictMode>
)
