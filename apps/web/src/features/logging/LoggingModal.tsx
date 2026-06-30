import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { levelThumbnailUrl } from '@/lib/gdAssets'
import { useLoggingFlow } from './LoggingFlowProvider'
import type { FlowPath, FlowStep } from './types'
import { FindLevelStep } from './steps/FindLevelStep'
import { ResolvingStep } from './steps/ResolvingStep'
import { ManualLevelStep } from './steps/ManualLevelStep'
import { CompletionBasicsStep } from './steps/CompletionBasicsStep'
import { CompletionRatingStep } from './steps/CompletionRatingStep'
import { CompletionListRefsStep } from './steps/CompletionListRefsStep'
import { CompletionSessionStep } from './steps/CompletionSessionStep'
import { CompletionReviewStep } from './steps/CompletionReviewStep'
import { CompletionGddlStep } from './steps/CompletionGddlStep'
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
    case 'resolving':
      return { eyebrow: e(''), title: 'Loading entry…', progress: 0.12 }
    case 'manual':
      return { eyebrow: e(''), title: 'Enter level details', progress: 0.12 }
    case 'c_basics':
      return {
        eyebrow: e(' · Step 1 of 4'),
        title: 'The basics',
        progress: 1 / 4,
      }
    case 'c_rating':
      return {
        eyebrow: e(' · Step 2 of 4'),
        title: 'How was it?',
        progress: 2 / 4,
      }
    case 'c_session':
      return {
        eyebrow: e(' · Step 3 of 4'),
        title: 'Session details',
        progress: 3 / 4,
      }
    case 'c_listrefs':
      return {
        eyebrow: e(' · Step 4 of 4'),
        title: 'List references',
        progress: 1,
      }
    case 'c_review':
      return { eyebrow: e(' · Review'), title: 'Looks good?', progress: 1 }
    case 'p_core':
      return {
        eyebrow: e(' · Step 1 of 2'),
        title: 'Where are you at?',
        progress: 1 / 2,
      }
    case 'p_session':
      return {
        eyebrow: e(' · Step 2 of 2'),
        title: 'Session details',
        progress: 1,
      }
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
    case 'resolving':
      return <ResolvingStep />
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
    case 'c_gddl':
      return <CompletionGddlStep />
    case 'c_success':
      return <CompletionSuccessStep />
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
  const { isOpen, path, step, level, close } = useLoggingFlow()
  const [confirmingClose, setConfirmingClose] = useState(false)

  // Both c_gddl and c_success are post-save: the completion is already written,
  // so they use the small-card layout and don't need close-guard.
  const isPostSave = step === 'c_gddl' || step === 'c_success'
  const header = headerConfig(path, step)

  // Once the user has committed to logging (anything past "find" and before the
  // post-save cards), an accidental click outside shouldn't discard the
  // in-progress entry, and an explicit close (X / Escape) asks for confirmation.
  const guardClose = step !== 'find' && step !== 'resolving' && !isPostSave

  // Reset the confirmation prompt whenever the modal fully closes/reopens.
  useEffect(() => {
    if (!isOpen) setConfirmingClose(false)
  }, [isOpen])

  function requestClose() {
    if (guardClose) setConfirmingClose(true)
    else close()
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(o) => !o && requestClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          onInteractOutside={(e) => {
            if (guardClose) e.preventDefault()
          }}
          onEscapeKeyDown={(e) => {
            // Route Escape through the confirmation prompt instead of closing.
            if (guardClose) e.preventDefault()
            requestClose()
          }}
          className={cn(
            'fixed z-50 focus:outline-none',
            // Desktop: centered panel. The inset resets here are longhand on
            // purpose — mixing the `inset`/`inset-x` shorthand with `left`/`top`
            // at the same breakpoint clobbers positioning (Tailwind's utility
            // sort order lets `inset-auto` win), which stranded the modal in the
            // top-left corner on desktop and after a viewport resize.
            'md:left-1/2 md:top-1/2 md:right-auto md:bottom-auto md:max-w-[calc(100vw-2rem)] md:-translate-x-1/2 md:-translate-y-1/2',
            isPostSave
              ? // Mobile: bottom sheet. Desktop: 420px centered card.
                'inset-x-0 bottom-0 w-full md:w-[420px]'
              : // Mobile: full-screen. Desktop: 760px centered panel.
                'inset-0 md:w-[760px]'
          )}
        >
          {isPostSave ? (
            <div className="rounded-t-card border border-border bg-bg-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)] md:rounded-card">
              <div className="flex justify-center pt-2 pb-1 md:hidden">
                <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
              </div>
              <Dialog.Title className="sr-only">
                {step === 'c_gddl' ? 'Submit to GDDL' : 'Completion logged'}
              </Dialog.Title>
              <StepView step={step} />
            </div>
          ) : (
            <div className="relative flex h-full flex-col overflow-hidden border-border bg-bg-surface shadow-[0_24px_64px_rgba(0,0,0,0.6)] md:h-[640px] md:max-h-[calc(100vh-4rem)] md:rounded-card md:border">
              {/* Full-panel level thumbnail backdrop (mockup style). Shown once a
                  level is resolved; a heavy scrim keeps the form readable. */}
              {level && (
                <>
                  <img
                    src={levelThumbnailUrl(level.inGameId)}
                    alt=""
                    aria-hidden
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                    className="pointer-events-none absolute inset-0 size-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-bg-base/85" />
                </>
              )}

              <div className="relative z-10 flex min-h-0 flex-1 flex-col [&_input]:bg-[color-mix(in_oklab,var(--color-bg-surface)_70%,transparent)] [&_textarea]:bg-[color-mix(in_oklab,var(--color-bg-surface)_70%,transparent)]">
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

              {confirmingClose && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg-base/70 p-6 backdrop-blur-sm">
                  <div className="w-full max-w-sm rounded-card border border-border bg-bg-elevated p-5 shadow-[0_16px_48px_rgba(0,0,0,0.6)]">
                    <p className="text-base font-semibold text-text-primary">
                      Discard this log?
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">
                      Your progress won&apos;t be saved.
                    </p>
                    <div className="mt-5 flex justify-end gap-3">
                      <Button
                        variant="outline"
                        onClick={() => setConfirmingClose(false)}
                      >
                        Keep editing
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => {
                          setConfirmingClose(false)
                          close()
                        }}
                      >
                        Discard
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
