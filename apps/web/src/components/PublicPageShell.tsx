import { ArrowLeft } from 'lucide-react'
import { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useGoBack } from '@/lib/useGoBack'
import { BackLink } from '@/components/BackLink'

/**
 * Shared shell for standalone public pages that sit outside the authenticated
 * app shell (legal docs, acknowledgments) — dark single-column background and
 * a consistent way back to wherever the user came from.
 */
export function PublicPageShell({
  maxWidthClassName = 'max-w-[680px]',
  children,
}: {
  maxWidthClassName?: string
  children: ReactNode
}) {
  const back = useGoBack('/')

  return (
    <div className="min-h-screen bg-bg-base text-foreground">
      <div className={cn('mx-auto px-6 py-12', maxWidthClassName)}>
        <BackLink
          back={back}
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          {back.isOrigin ? 'Back' : 'Back to InfernoLog'}
        </BackLink>

        {children}
      </div>
    </div>
  )
}
