import { useLocation, useNavigate, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { readBackOrigin } from '@/lib/backOrigin'

// Shared shell for standalone public pages that sit outside the authenticated
// app shell (legal docs, acknowledgments) — dark single-column background and
// a consistent way back to wherever the user came from.
export function PublicPageShell({
  maxWidthClassName = 'max-w-[680px]',
  children,
}: {
  maxWidthClassName?: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const location = useLocation()

  // Prefer the remembered origin (e.g. Settings) — it's set whenever this
  // page was reached via an in-app link. Otherwise pop real history, falling
  // back to the landing page if there's none to pop (a direct visit or an
  // external referral). Mirrors GlobalLevelPage/LevelPage's goBack.
  const origin = readBackOrigin(location.state)
  function goBack() {
    if (origin) {
      void navigate({ href: origin.href, replace: true })
    } else if (window.history.length > 1) {
      router.history.back()
    } else {
      void navigate({ to: '/' })
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] text-foreground">
      <div className={cn('mx-auto px-6 py-12', maxWidthClassName)}>
        <button
          type="button"
          onClick={goBack}
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          {origin ? 'Back' : 'Back to InfernoLog'}
        </button>

        {children}
      </div>
    </div>
  )
}
