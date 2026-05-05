import './lib/auth'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { queryClient } from './lib/queryClient'
import { AuthProvider } from './context/AuthContext'
import { routeTree } from './routeTree.gen'
import './index.css'

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const ONE_DAY = 1000 * 60 * 60 * 24
const CACHE_KEY = 'infernolog:query-cache'

const persister = {
  persistClient: (client: unknown) => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(client))
    return Promise.resolve()
  },
  restoreClient: () => {
    const item = localStorage.getItem(CACHE_KEY)
    return Promise.resolve(item ? JSON.parse(item) : undefined)
  },
  removeClient: () => {
    localStorage.removeItem(CACHE_KEY)
    return Promise.resolve()
  },
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: ONE_DAY }}
    >
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </PersistQueryClientProvider>
  </StrictMode>
)
