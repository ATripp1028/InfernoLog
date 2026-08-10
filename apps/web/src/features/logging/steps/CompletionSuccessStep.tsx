import { Check } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { useLoggingFlow } from '../LoggingFlowProvider'

/**
 * Screen 09. "Place now" routes to the ranking page, passing the new
 * completion's level_progress id so the page highlights it in Unplaced and
 * pre-scrolls the ranked list to its GDDL-reference tier.
 */
export function CompletionSuccessStep() {
  const { level, close, lastCompletionLevelProgressId } = useLoggingFlow()
  const navigate = useNavigate()
  const name = level?.name ?? 'Level'

  return (
    <div className="p-6">
      <div className="mb-4 flex size-10 items-center justify-center rounded-md bg-success-dim text-success">
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
            void navigate({
              to: '/ranking',
              search: lastCompletionLevelProgressId
                ? { place: lastCompletionLevelProgressId }
                : {},
            })
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
