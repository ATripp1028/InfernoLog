import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from '@/components/generic/sonner'
import { ApiError } from '@/lib/api/client'
import { useResolveLevel } from '@/lib/api/logging'
import { useLoggingFlow } from '@/context/LoggingFlowContext'
import { StepBody } from '../components'

/**
 * Auto-resolves a pre-targeted level when editing (openForEdit), then hands off
 * to applyResolved/goManual — the same transition FindLevelStep performs after
 * the user picks a level. Renders only a brief loading state.
 */
export function ResolvingStep() {
  const { pendingEditLevelId, applyResolved, goManual, close } =
    useLoggingFlow()
  const resolveLevel = useResolveLevel()
  // Resolve exactly once per mount, even under StrictMode double-invocation.
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    const levelId = pendingEditLevelId
    if (!levelId) {
      close()
      return
    }

    void (async () => {
      try {
        const res = await resolveLevel.mutateAsync(levelId)
        if (res.fallbackToManual) {
          goManual(levelId, res.existingCompletion)
          return
        }
        if (res.level) {
          applyResolved({
            level: res.level,
            existingCompletion: res.existingCompletion,
            suggestedGddlTier: res.suggestedGddlTier,
          })
        } else {
          toast.error('Could not load that level')
          close()
        }
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : 'Could not load that level'
        )
        close()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <StepBody>
      <div className="flex items-center justify-center gap-2 py-10 text-text-secondary">
        <Loader2 className="size-5 animate-spin" />
        Loading entry…
      </div>
    </StepBody>
  )
}
