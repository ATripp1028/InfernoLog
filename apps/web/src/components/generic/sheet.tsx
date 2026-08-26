import { forwardRef } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * A slide-in drawer over Radix Dialog. Used by the List page for the filter
 * panel (right) on tablet/below and the mobile controls/filters sheets (bottom).
 */
export const Sheet = DialogPrimitive.Root
/**
 * Radix Dialog trigger, re-exported as the sheet trigger.
 */
export const SheetTrigger = DialogPrimitive.Trigger
/**
 * Radix Dialog close, re-exported as the sheet close.
 */
export const SheetClose = DialogPrimitive.Close
/**
 * Radix Dialog title. Required for screen readers even when visually hidden.
 */
export const SheetTitle = DialogPrimitive.Title
/**
 * Radix Dialog description, re-exported unchanged.
 */
export const SheetDescription = DialogPrimitive.Description

const SheetOverlay = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
))
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName

const sheetVariants = cva(
  // No `transition` here: the enter/exit keyframes below already own the
  // slide, and a transition on the same properties makes the browser animate
  // transform twice over — which reads as a stutter on the frame the sheet
  // opens. See the note at the MobileActionSheet call in pages/List.tsx.
  'fixed z-50 flex flex-col bg-bg-surface shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300',
  {
    variants: {
      side: {
        right:
          'inset-y-0 right-0 h-full w-[320px] max-w-[90vw] border-l border-border-subtle data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
        bottom:
          'inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t border-border-subtle data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
      },
    },
    defaultVariants: { side: 'right' },
  }
)

interface SheetContentProps
  extends
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

/**
 * The sliding sheet surface, with its side and animation.
 */
export const SheetContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side = 'right', className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
))
SheetContent.displayName = DialogPrimitive.Content.displayName
