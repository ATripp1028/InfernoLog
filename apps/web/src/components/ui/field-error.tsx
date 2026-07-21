import type { ReactNode } from 'react'

// Inline validation message shown under a field, e.g. when a typed number
// exceeds the field's max — pairs with blocking (not silently clamping)
// invalid input at submission time.
export function FieldError({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs text-danger">{children}</p>
}
