import { useEffect, useState } from 'react'

/**
 * Tracks whether a CSS media query currently matches. Used to switch the List
 * filter panel between a docked aside (md+) and an overlay sheet (mobile).
 *
 * The first value is read synchronously during the initial render rather than
 * in the effect: callers that mount one layout *or* the other (rather than
 * rendering both and hiding one with `md:`) would otherwise paint the mobile
 * tree once and immediately swap it out.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => matchesNow(query))

  useEffect(() => {
    const mql = window.matchMedia(query)
    const update = () => setMatches(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [query])

  return matches
}

/** `matchMedia` guarded for environments that lack it, so a read during render is safe. */
function matchesNow(query: string): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(query).matches
}
