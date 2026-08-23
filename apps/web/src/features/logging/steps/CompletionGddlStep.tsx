import { useState } from 'react'
import { AlertCircle, Check } from 'lucide-react'
import { Button } from '@/components/generic/button'
import { useSubmitGddlRecord } from '@/lib/api/logging'
import { useFlowBusy, useLoggingFlow } from '../LoggingFlowProvider'
import { ApiError } from '@/lib/api/client'

/**
 * Optional post-completion step: submit the completion to GDDL as a record.
 */
export function CompletionGddlStep() {
  const { level, setStep } = useLoggingFlow()
  const submitGddl = useSubmitGddlRecord()
  useFlowBusy(submitGddl.isPending)
  const [done, setDone] = useState(false)

  if (!level) return null

  function skip() {
    setStep('c_success')
  }

  function handleSubmit() {
    submitGddl.mutate(level!.inGameId, {
      onSuccess: () => {
        setDone(true)
        setTimeout(() => setStep('c_success'), 1200)
      },
    })
  }

  if (done) {
    return (
      <div className="p-6">
        <div className="mb-4 flex size-10 items-center justify-center rounded-md bg-success-dim text-success">
          <Check size={22} strokeWidth={3} />
        </div>
        <p className="text-base font-semibold text-text-primary">
          Submitted to GDDL
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          Taking you to your ranking…
        </p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <p className="text-base font-semibold text-text-primary">
        Submit to GDDL?
      </p>
      <p className="mt-1 text-sm text-text-secondary">
        Send this completion to the GD Ladder using your connected API key. You
        can always do this later from the level page.
      </p>

      {submitGddl.error && (
        <div className="mt-4 flex items-start gap-2.5 rounded-md border border-danger-dim bg-danger-dim/40 px-3 py-2.5 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>
            {submitGddl.error instanceof ApiError
              ? submitGddl.error.message
              : 'GDDL submission failed. Check your key or try again.'}
          </span>
        </div>
      )}

      <div className="mt-6 flex items-center justify-end gap-3">
        <Button variant="outline" onClick={skip}>
          {submitGddl.error ? 'Skip' : 'Skip for now'}
        </Button>
        <Button onClick={handleSubmit} disabled={submitGddl.isPending}>
          {submitGddl.isPending
            ? 'Submitting…'
            : submitGddl.error
              ? 'Try again'
              : 'Submit to GDDL'}
        </Button>
      </div>
    </div>
  )
}
