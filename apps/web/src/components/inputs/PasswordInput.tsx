import { forwardRef } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input, type InputProps } from '@/components/generic/input'
import { cn } from '@/lib/utils'
import { usePasswordInput } from './usePasswordInput'

/**
 * A password field with a show/hide toggle.
 *
 * ⚠️ CREDENTIALS — the value lives only in the owning form's state. Set
 * `autoComplete` to `current-password` or `new-password` so password managers
 * fill and save it correctly.
 */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<InputProps, 'type'>
>(({ className, ...props }, ref) => {
  const { visible, toggleVisible } = usePasswordInput()
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={cn('h-10 pr-10', className)}
        spellCheck={false}
        autoCapitalize="none"
        {...props}
      />
      <button
        type="button"
        onClick={toggleVisible}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
})
PasswordInput.displayName = 'PasswordInput'
