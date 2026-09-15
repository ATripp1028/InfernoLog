import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/generic/button'
import { GoogleIcon } from '@/components/data/providerIcons'

interface AuthLayoutProps {
  title: string
  /** The email-and-password form: the main panel, on the left. */
  children: ReactNode
  /** The connected-account panel, on the right (below on narrow screens). */
  connectedAccounts: {
    title: string
    description: string
    googleLabel: string
    onGoogle: () => void
  }
  /** A notice above the card, e.g. why the visitor was sent here. */
  notice?: ReactNode
  /** The line under the card linking to the other auth page. */
  footer: ReactNode
}

/**
 * The sign-in and sign-up page frame: credentials on the left, connected
 * accounts on a recessed panel to the right with an "or" seam between them, so
 * the two read as separate ways in rather than one long form.
 *
 * Discord is deliberately absent until it can be used to sign in.
 */
export function AuthLayout({
  title,
  children,
  connectedAccounts,
  notice,
  footer,
}: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base px-4 py-12 text-foreground">
      <div className="w-full max-w-[780px] space-y-5">
        <div className="space-y-1.5 text-center">
          <Link
            to="/"
            className="font-mono text-xs uppercase tracking-[0.14em] text-primary hover:text-primary-hover"
          >
            InfernoLog
          </Link>
          <h1 className="text-2xl font-semibold">{title}</h1>
        </div>

        {notice}

        <div className="grid overflow-hidden rounded-card border border-border bg-bg-surface md:grid-cols-[1.25fr_1fr]">
          <div className="p-6 sm:p-7">{children}</div>

          <div className="relative space-y-3.5 border-t border-border bg-bg-inset p-6 sm:p-7 md:border-l md:border-t-0">
            <span
              aria-hidden="true"
              className="absolute left-1/2 top-0 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-bg-elevated text-xs text-muted-foreground md:left-0 md:top-1/2"
            >
              or
            </span>
            <h2 className="text-[15px] font-semibold">
              {connectedAccounts.title}
            </h2>
            <p className="text-sm text-muted-foreground">
              {connectedAccounts.description}
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-start gap-3 bg-bg-elevated px-3.5"
              onClick={connectedAccounts.onGoogle}
            >
              <GoogleIcon />
              {connectedAccounts.googleLabel}
            </Button>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground">{footer}</p>
      </div>
    </div>
  )
}

/**
 * A notice banner for the top of an auth page.
 */
export function AuthNoticeBanner({
  tone,
  children,
}: {
  tone: 'info' | 'error'
  children: ReactNode
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={
        tone === 'error'
          ? 'rounded-md border border-danger/40 bg-danger-dim px-3 py-2.5 text-sm text-danger-soft'
          : 'rounded-md border border-success/40 bg-success-dim px-3 py-2.5 text-sm text-success-soft'
      }
    >
      {children}
    </div>
  )
}
