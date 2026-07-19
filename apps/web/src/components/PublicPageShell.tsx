import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Shared shell for standalone public pages that sit outside the authenticated
// app shell (legal docs, acknowledgments) — dark single-column background and
// a consistent way back to the landing page.
export function PublicPageShell({
  maxWidthClassName = 'max-w-[680px]',
  children,
}: {
  maxWidthClassName?: string
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-[var(--color-bg-base)] text-foreground">
      <div className={cn('mx-auto px-6 py-12', maxWidthClassName)}>
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          Back to InfernoLog
        </Link>

        {children}
      </div>
    </div>
  )
}
