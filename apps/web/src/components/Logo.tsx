import { Diamond } from 'lucide-react'

interface LogoProps {
  variant?: 'full' | 'icon'
}

/**
 * The InfernoLog wordmark. `variant="mark"` drops the text for narrow chrome.
 */
export function Logo({ variant = 'full' }: LogoProps) {
  return (
    <div className="flex items-center gap-2">
      <Diamond
        className="text-primary"
        size={24}
        fill="currentColor"
        strokeWidth={0}
      />
      {variant === 'full' && (
        <span className="text-lg font-bold text-text-primary">InfernoLog</span>
      )}
    </div>
  )
}
