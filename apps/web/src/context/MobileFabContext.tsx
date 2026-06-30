import { createContext, useContext, useState, type ReactNode } from 'react'

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

  function setOverrideToggle(toggle: (() => void) | null) {
    // Wrap in arrow so React doesn't treat it as a state updater function
    _setOverrideToggle(toggle ? () => toggle : null)
  }

  return (
    <MobileFabContext.Provider value={{ overrideToggle, setOverrideToggle }}>
      {children}
    </MobileFabContext.Provider>
  )
}

export function useMobileFabContext() {
  return useContext(MobileFabContext)
}
