import { forwardRef } from 'react'
import { Input, type InputProps } from '@/components/generic/input'
import { cn } from '@/lib/utils'

/**
 * A field for a six-digit emailed code.
 *
 * One input rather than six boxes, so pasting and the browser's one-time-code
 * autofill both work.
 *
 * ⚠️ CREDENTIALS — a code is a credential; the value lives only in the owning
 * form's state.
 */
export const VerificationCodeInput = forwardRef<
  HTMLInputElement,
  Omit<InputProps, 'type' | 'inputMode' | 'autoComplete' | 'maxLength'>
>(({ className, ...props }, ref) => (
  <Input
    ref={ref}
    type="text"
    inputMode="numeric"
    autoComplete="one-time-code"
    pattern="[0-9]*"
    spellCheck={false}
    className={cn(
      'h-12 text-center font-mono text-2xl tracking-[0.4em]',
      className
    )}
    {...props}
  />
))
VerificationCodeInput.displayName = 'VerificationCodeInput'
