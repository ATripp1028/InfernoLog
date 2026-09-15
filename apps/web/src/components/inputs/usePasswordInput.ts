import { useState } from 'react'

/**
 * Whether a password field is currently showing what was typed.
 *
 * Starts hidden every time the field mounts; the choice is never stored.
 */
export function usePasswordInput() {
  const [visible, setVisible] = useState(false)
  return {
    visible,
    toggleVisible: () => setVisible((v) => !v),
  }
}
