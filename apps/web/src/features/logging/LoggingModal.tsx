import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLoggingFlow } from './LoggingFlowProvider'
import type { FlowPath, FlowStep } from './types'
import { FindLevelStep } from './steps/FindLevelStep'
import { ManualLevelStep } from './steps/ManualLevelStep'
import { CompletionBasicsStep } from './steps/CompletionBasicsStep'
import { CompletionRatingStep } from './steps/CompletionRatingStep'
import { CompletionListRefsStep } from './steps/CompletionListRefsStep'
import { CompletionSessionStep } from './steps/CompletionSessionStep'
import { CompletionReviewStep } from './steps/CompletionReviewStep'
import { CompletionSuccessStep } from './steps/CompletionSuccessStep'
import { ProgressStep } from './steps/ProgressStep'
import { ProgressSessionStep } from './steps/ProgressSessionStep'
import { DropStep } from './steps/DropStep'

const EYEBROW_BASE: Record<FlowPath, string> = {
  completion: 'Log a completion',
  progress: 'Log progress',
  drop: 'Drop a level',
}

interface HeaderConfig {
  eyebrow: string
  title: string
  progress: number // 0..1 fill of the step bar
}

function headerConfig(path: FlowPath | null, step: FlowStep): HeaderConfig {
  const base = path ? EYEBROW_BASE[path] : 'Log'
  const e = (suffix: string) => `${base}${suffix}`.toUpperCase()
  switch (step) {
    case 'find':
      return { eyebrow: e(''), title: 'Find the level', progress: 0.12 }
    case 'manual':
      return { eyebrow: e(''), title: 'Enter level details', progress: 0.12 }
    case 'c_basics':
      return { eyebrow: e(' · Step 1 of 4'), title: 'The basics', progress: 1 / 4 }
    case 'c_rating':
      return { eyebrow: e(' · Step 2 of 4'), title: 'How was it?', progress: 2 / 4 }
    case 'c_listrefs':
      return { eyebrow: e(' · Step 3 of 4'), title: 'List references', progress: 3 / 4 }
    case 'c_session':
      return { eyebrow: e(' · Step 4 of 4'), title: 'Session details', progress: 1 }
    case 'c_review':
      return { eyebrow: e(' · Review'), title: 'Looks good?', progress: 1 }
    case 'p_core':
      return { eyebrow: e(' · Step 1 of 2'), title: 'Where are you at?', progress: 1 / 2 }
    case 'p_session':
      return { eyebrow: e(' · Step 2 of 2'), title: 'Session details', progress: 1 }
    case 'd_main':
      return { eyebrow: e(''), title: 'Dropping this one', progress: 1 }
    default:
      return { eyebrow: e(''), title: '', progress: 0 }
  }
}

function StepView({ step }: { step: FlowStep }) {
  switch (step) {
    case 'find':
      return <FindLevelStep />
    case 'manual':
      return <ManualLevelStep />
    case 'c_basics':
      return <CompletionBasicsStep />
    case 'c_rating':
      return <CompletionRatingStep />
    case 'c_listrefs':
      return <CompletionListRefsStep />
    case 'c_session':
      return <CompletionSessionStep />
    case 'c_review':
      return <CompletionReviewStep />
    case 'p_core':
      return <ProgressStep />
    case 'p_session':
      return <ProgressSessionStep />
    case 'd_main':
      return <DropStep />
    default:
      return null
  }
}

export function LoggingModal() {
  const { isOpen, path, step, close } = useLoggingFlow()

  const isSuccess = step === 'c_success'
  const header = headerConfig(path, step)

  // Once the user has committed to a level (anything past "find"), an accidental
  // click outside shouldn't discard their in-progress entry. The X button and
  // Escape remain deliberate exits. The post-save success card is dismissible.
  const lockOutsideClose = step !== 'find' && step !== 'c_success'

  return (
    <Dialog.Root open={isOpen} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          onInteractOutside={(e) => {
            if (lockOutsideClose) e.preventDefault()
          }}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 focus:outline-none',
            isSuccess ? 'w-[420px]' : 'w-[760px]'
          )}
        >
          {isSuccess ? (
            <div className="rounded-card border border-border bg-bg-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)]">
              <Dialog.Title className="sr-only">Completion logged</Dialog.Title>
              <CompletionSuccessStep />
            </div>
          ) : (
            <div className="flex max-h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-card border border-border bg-bg-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)]">
              <div className="relative px-6 pb-0 pt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {header.eyebrow}
                </p>
                <Dialog.Title className="mt-1 text-2xl font-semibold text-text-primary">
                  {header.title}
                </Dialog.Title>
                <Dialog.Close
                  aria-label="Close"
                  className="absolute right-5 top-5 flex size-8 items-center justify-center rounded-md bg-bg-elevated text-text-secondary transition-colors hover:text-text-primary"
                >
                  <X size={16} />
                </Dialog.Close>
                <div className="mt-4 h-0.5 w-full overflow-hidden rounded-full bg-bg-subtle">
                  <div
                    className="h-full bg-primary transition-[width] duration-300"
                    style={{ width: `${Math.round(header.progress * 100)}%` }}
                  />
                </div>
              </div>
              <StepView step={step} />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
