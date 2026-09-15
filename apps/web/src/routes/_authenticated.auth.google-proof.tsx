import { createFileRoute } from '@tanstack/react-router'
import { GoogleProofComplete } from '@/pages/GoogleProofComplete'

type GoogleProofSearch = {
  code?: string | undefined
  state?: string | undefined
  error?: string | undefined
}

const str = (value: unknown) => (typeof value === 'string' ? value : undefined)

export const Route = createFileRoute('/_authenticated/auth/google-proof')({
  validateSearch: (search: Record<string, unknown>): GoogleProofSearch => ({
    code: str(search.code),
    state: str(search.state),
    error: str(search.error),
  }),
  component: GoogleProofComplete,
})
