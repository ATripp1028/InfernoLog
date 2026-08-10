import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

/**
 * Shared sensor setup for every settings-page sortable list.
 *
 * MouseSensor (with a small distance constraint) lets mouse users start a
 * drag with a quick mousedown + slight move. TouchSensor uses a delay
 * activation so a normal finger flick still scrolls the page — only a
 * deliberate long-press on the handle starts a drag. KeyboardSensor keeps
 * the lists usable for non-pointer input.
 *
 * Without TouchSensor + the matching `touch-action: none` on the drag
 * handle, dragging is effectively dead on mobile because the browser
 * claims the touch as a scroll before dnd-kit can react.
 */
export function useSortableSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    })
  )
}
