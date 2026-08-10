import { QueryClient } from '@tanstack/react-query'

const ONE_DAY = 1000 * 60 * 60 * 24

/**
 * The app's single react-query client.
 *
 * `gcTime` is a full day to match the localStorage persister's `MAX_AGE` — a
 * shorter one would evict entries the persister then restores, which reads as
 * cache thrash on the next launch.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      gcTime: ONE_DAY,
      retry: 2,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
})
