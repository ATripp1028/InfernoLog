import { Check } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { useLoggingFlow } from '../LoggingFlowProvider'

// Screen 09. Ranking placement isn't built yet, so "Place now" routes to the
// (placeholder) ranking page; real fractional-index placement is a later task.
export function CompletionSuccessStep() {
  const { level, close } = useLoggingFlow()
  const navigate = useNavigate()
  const name = level?.name ?? 'Level'

  return (
    <div className="p-6">
      <div className="mb-4 flex size-10 items-center justify-center rounded-md bg-[var(--color-success-dim)] text-success">
        <Check size={22} strokeWidth={3} />
      </div>
      <h2 className="text-xl font-semibold text-text-primary">{name} logged</h2>
      <p className="mt-2 text-sm text-text-secondary">
        Want to place it in your ranking now? Its GDDL tier just sets where you
        start scrolling — you place it yourself.
      </p>
      <div className="mt-8 flex items-center justify-end gap-3">
        <Button variant="outline" onClick={close}>
          Place later
        </Button>
        <Button
          onClick={() => {
            close()
            void navigate({ to: '/ranking' })
          }}
        >
          Place now
        </Button>
      </div>
      <p className="mt-3 text-xs text-text-tertiary">
        &quot;Place later&quot; keeps it in your Unplaced panel until
        you&apos;re ready.
      </p>
    </div>
  )
}
