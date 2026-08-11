import { useEffect, useRef, useState } from 'react'

// How long the group stays expanded after the pointer leaves it. Gives the
// cursor room to cross gaps between buttons (or overshoot briefly) without
// the stack collapsing back into the FAB.
export const CLOSE_DELAY_MS = 350

/**
 * The open/close state machine behind {@link DesktopHoverFab}'s speed dial.
 *
 * Hovering or focusing the group opens it immediately; leaving it schedules a
 * close on a grace delay rather than closing at once. Escape and a click
 * outside close it now, whichever way it was opened.
 */
export function useDesktopHoverFab() {
  const [expanded, setExpanded] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )
  const containerRef = useRef<HTMLDivElement>(null)

  function cancelClose() {
    clearTimeout(closeTimer.current)
  }

  /** Opens the group now, cancelling any close already scheduled. */
  function openGroup() {
    cancelClose()
    setExpanded(true)
  }

  /** Closes the group after the grace delay, restarting it if already ticking. */
  function scheduleClose() {
    cancelClose()
    closeTimer.current = setTimeout(() => setExpanded(false), CLOSE_DELAY_MS)
  }

  /**
   * Closes only when focus has actually left the group — moving between two
   * buttons inside it fires a blur that must not collapse the stack.
   */
  function handleBlur(nextFocused: Node | null) {
    if (!containerRef.current?.contains(nextFocused)) scheduleClose()
  }

  // Escape and clicks outside the group close it immediately, regardless of
  // whether it was opened via hover (no focus involved) or keyboard focus —
  // the container's own onKeyDown/onBlur only fire when focus is inside it,
  // which hover-only expansion never establishes.
  useEffect(() => {
    if (!expanded) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpanded(false)
    }
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setExpanded(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [expanded])

  // A pending close must not fire into an unmounted component.
  useEffect(() => () => cancelClose(), [])

  return { expanded, containerRef, openGroup, scheduleClose, handleBlur }
}
