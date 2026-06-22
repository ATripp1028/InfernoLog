import { forwardRef } from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/utils'

// Dual-thumb range slider used by the List page filters (rating, enjoyment,
// tier, attempts, date ranges). Built on the same Radix primitive as the
// single-thumb Slider, but renders two thumbs from an array value.
//
// Pass an optional `trackClassName` to override the active-range fill (e.g. the
// GDDL tier slider uses a difficulty gradient instead of the solid primary).
interface RangeSliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  trackClassName?: string | undefined
}

export const RangeSlider = forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  RangeSliderProps
>(({ className, trackClassName, ...props }, ref) => {
  // Number of thumbs to render — one per value entry (default to 2).
  const count = (props.value ?? props.defaultValue)?.length ?? 2
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        'relative flex w-full touch-none select-none items-center',
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
        <SliderPrimitive.Range
          className={cn('absolute h-full bg-[var(--color-primary)]', trackClassName)}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: count }).map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          className="block size-[18px] rounded-full bg-white shadow-[0px_2px_4px_0px_rgba(0,0,0,0.4)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  )
})
RangeSlider.displayName = 'RangeSlider'
