import { useLocation, useNavigate, useRouter } from '@tanstack/react-router'
import { readBackOrigin } from './backOrigin'

/**
 * What a back affordance should render and do. See {@link useGoBack}.
 */
export interface GoBack {
  // Set whenever the destination is a real URL (the remembered origin, or the
  // fallback route) so callers can render an actual `Link` — preserving
  // native anchor behavior (open in new tab, copy link) — instead of a plain
  // button. Undefined only for the history-pop case, which has no
  // representable URL.
  href: string | undefined
  replace: boolean
  onClick: () => void
  // True when `href` came from the remembered origin rather than the caller's
  // fallback route — lets callers vary copy ("Back" vs "Back to X") by which
  // destination was actually used.
  isOrigin: boolean
}

/**
 * Where a page's back affordance should go: the remembered origin if this
 * page was reached via an in-app link, otherwise real browser history,
 * otherwise `fallbackTo`. Shared by GlobalLevelPage, LevelPage, and
 * PublicPageShell, which all need the same three-way fallback.
 */
export function useGoBack(fallbackTo: string): GoBack {
  const location = useLocation()
  const navigate = useNavigate()
  const router = useRouter()
  const origin = readBackOrigin(location.state)

  if (origin) {
    return {
      href: origin.href,
      replace: true,
      isOrigin: true,
      onClick: () => void navigate({ href: origin.href, replace: true }),
    }
  }
  if (window.history.length > 1) {
    return {
      href: undefined,
      replace: false,
      isOrigin: false,
      onClick: () => router.history.back(),
    }
  }
  return {
    href: fallbackTo,
    replace: false,
    isOrigin: false,
    onClick: () => void navigate({ to: fallbackTo }),
  }
}
