import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

interface MobileFabContextValue {
  overrideToggle: (() => void) | null
  setOverrideToggle: (toggle: (() => void) | null) => void
}

const MobileFabContext = createContext<MobileFabContextValue>({
  overrideToggle: null,
  setOverrideToggle: () => {},
})

export function MobileFabProvider({ children }: { children: ReactNode }) {
  const [overrideToggle, _setOverrideToggle] = useState<(() => void) | null>(
    null
  )

  // Stable identity so consumers that register in an effect keyed on this
  // setter don't re-run every render (which would loop: set state → re-render
  // → new setter → effect re-runs → set state → …).
  const setOverrideToggle = useCallback((toggle: (() => void) | null) => {
    // Wrap in arrow so React doesn't treat it as a state updater function
    _setOverrideToggle(toggle ? () => toggle : null)
  }, [])

  const value = useMemo(
    () => ({ overrideToggle, setOverrideToggle }),
    [overrideToggle, setOverrideToggle]
  )

  return (
    <MobileFabContext.Provider value={value}>
      {children}
    </MobileFabContext.Provider>
  )
}

export function useMobileFabContext() {
  return useContext(MobileFabContext)
}
