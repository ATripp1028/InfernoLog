import type { MouseEvent, ReactNode } from 'react'
import type { GoBack } from '@/lib/useGoBack'

interface BackLinkProps {
  back: GoBack
  className?: string
  ariaLabel?: string
  children: ReactNode
}

/**
 * Renders a real `<a href>` whenever `back` has a known destination —
 * preserving native anchor behavior (middle/ctrl/cmd-click to open in a new
 * tab, right-click to copy the link, the assistive-tech "link" role) — and
 * falls back to a plain button only for the true browser-history-pop case,
 * which has no representable URL. A plain click still routes through the
 * router (via `back.onClick`) instead of a full page load. Pairs with
 * `useGoBack`.
 */
export function BackLink({
  back,
  className,
  ariaLabel,
  children,
}: BackLinkProps) {
  if (back.href) {
    const href = back.href
    return (
      <a
        href={href}
        aria-label={ariaLabel}
        className={className}
        onClick={(e: MouseEvent<HTMLAnchorElement>) => {
          if (
            e.button !== 0 ||
            e.metaKey ||
            e.ctrlKey ||
            e.shiftKey ||
            e.altKey
          ) {
            return
          }
          e.preventDefault()
          back.onClick()
        }}
      >
        {children}
      </a>
    )
  }
  return (
    <button
      type="button"
      onClick={back.onClick}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </button>
  )
}
