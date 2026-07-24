import { useEffect, useRef, useState, type ReactElement } from 'react'
import { toast as sonnerToast } from 'sonner'
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
  XCircle,
} from 'lucide-react'

type ToastVariant = 'success' | 'error' | 'warning' | 'info'

const DEFAULT_DURATION = 4000

const VARIANT_CONFIG: Record<
  ToastVariant,
  {
    bg: string
    text: string
    trackFill: string
    barFill: string
    Icon: typeof CheckCircle2
  }
> = {
  success: {
    bg: 'var(--color-success)',
    text: '#ffffff',
    trackFill: 'rgba(255,255,255,0.25)',
    barFill: 'rgba(255,255,255,0.9)',
    Icon: CheckCircle2,
  },
  error: {
    bg: 'var(--color-danger)',
    text: '#ffffff',
    trackFill: 'rgba(255,255,255,0.25)',
    barFill: 'rgba(255,255,255,0.9)',
    Icon: XCircle,
  },
  info: {
    bg: 'var(--color-info)',
    text: '#ffffff',
    trackFill: 'rgba(255,255,255,0.25)',
    barFill: 'rgba(255,255,255,0.9)',
    Icon: Info,
  },
  // Amber is too light for white text to read reliably, so warning uses a
  // dark foreground instead of the white every other filled variant uses.
  warning: {
    bg: 'var(--color-warning)',
    text: 'var(--color-bg-base)',
    trackFill: 'rgba(0,0,0,0.15)',
    barFill: 'rgba(0,0,0,0.55)',
    Icon: AlertTriangle,
  },
}

function useDismissTimer(id: string | number, duration: number) {
  const remainingRef = useRef(duration)
  const startedAtRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  const clear = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }

  const start = (ms: number) => {
    clear()
    startedAtRef.current = Date.now()
    timeoutRef.current = setTimeout(() => sonnerToast.dismiss(id), ms)
  }

  useEffect(() => {
    start(remainingRef.current)
    return clear
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pause = () => {
    clear()
    const elapsed = Date.now() - startedAtRef.current
    remainingRef.current = Math.max(0, remainingRef.current - elapsed)
  }

  const resume = () => start(remainingRef.current)

  return { pause, resume }
}

interface CustomToastProps {
  id: string | number
  variant: ToastVariant
  message: string
  duration: number
}

function CustomToast({ id, variant, message, duration }: CustomToastProps) {
  const [paused, setPaused] = useState(false)
  const { pause, resume } = useDismissTimer(id, duration)
  const { bg, text, trackFill, barFill, Icon } = VARIANT_CONFIG[variant]

  return (
    <div
      role="status"
      className="relative w-[356px] max-[600px]:w-full overflow-hidden rounded-lg shadow-lg"
      style={{ backgroundColor: bg, color: text }}
      onMouseEnter={() => {
        setPaused(true)
        pause()
      }}
      onMouseLeave={() => {
        setPaused(false)
        resume()
      }}
    >
      <div className="flex items-start gap-2.5 px-4 py-3 pr-9">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="text-sm font-medium leading-snug">{message}</p>
      </div>
      <button
        type="button"
        onClick={() => sonnerToast.dismiss(id)}
        aria-label="Dismiss notification"
        className="absolute right-2 top-2 rounded-full p-1 opacity-70 transition-opacity hover:opacity-100"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
      <div
        className="absolute inset-x-0 bottom-0 h-1"
        style={{ backgroundColor: trackFill }}
      >
        <div
          className="h-full w-full origin-left"
          style={{
            backgroundColor: barFill,
            animation: `toast-countdown ${duration}ms linear forwards`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
        />
      </div>
    </div>
  )
}

function LoadingToast({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex w-[356px] max-[600px]:w-full items-center gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3 text-foreground shadow-lg"
    >
      <Loader2
        className="size-4 shrink-0 animate-spin text-info"
        aria-hidden="true"
      />
      <p className="text-sm font-medium leading-snug">{message}</p>
    </div>
  )
}

interface ToastOptions {
  id?: string
  duration?: number
}

function showToast(variant: ToastVariant) {
  return (message: string, opts?: ToastOptions) =>
    sonnerToast.custom(
      (id) => (
        <CustomToast
          id={id}
          variant={variant}
          message={message}
          duration={opts?.duration ?? DEFAULT_DURATION}
        />
      ),
      opts?.id !== undefined
        ? { id: opts.id, duration: Infinity }
        : { duration: Infinity }
    )
}

type ToastPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'top-center'
  | 'bottom-center'

// Narrow, hand-written surface rather than `typeof sonnerToast` — sonner's
// full type pulls in an unexported interface (used by `.promise`) that TS
// can't name in this project's declaration output.
interface AppToast {
  success: (message: string, opts?: ToastOptions) => string | number
  error: (message: string, opts?: ToastOptions) => string | number
  warning: (message: string, opts?: ToastOptions) => string | number
  info: (message: string, opts?: ToastOptions) => string | number
  loading: (message: string, opts: { id: string }) => string | number
  custom: (
    jsx: (id: string | number) => ReactElement,
    data?: { id?: string; duration?: number; position?: ToastPosition }
  ) => string | number
  dismiss: (id?: string | number) => string | number
}

export const toast: AppToast = {
  success: showToast('success'),
  error: showToast('error'),
  warning: showToast('warning'),
  info: showToast('info'),
  loading: (message, opts) =>
    sonnerToast.custom(() => <LoadingToast message={message} />, {
      id: opts.id,
      duration: Infinity,
    }),
  custom: sonnerToast.custom,
  dismiss: sonnerToast.dismiss,
}
