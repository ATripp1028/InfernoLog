import { useEffect, useState } from 'react'

// Tracks whether a CSS media query currently matches. Used to switch the List
// filter panel between a docked aside (md+) and an overlay sheet (mobile).
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const update = () => setMatches(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [query])

  return matches
}
