// Level-agnostic pickers used across the logging steps AND the level page's
// edit-run modal. They previously lived inside CompletionSessionStep.tsx,
// which five other modules had to reach into to get at them.

import { Info } from 'lucide-react'
import { Segmented } from '@/components/generic/segmented'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/generic/popover'
import type { Device, GdVersion } from '@/lib/api/wireEnums'

const DEVICE_OPTIONS = [
  { value: 'pc', label: 'PC' },
  { value: 'mobile', label: 'Mobile' },
] as const satisfies ReadonlyArray<{ value: Device; label: string }>

const GD_VERSION_OPTIONS = [
  { value: 'TWO_ONE', label: '2.1' },
  { value: 'TWO_TWO', label: '2.2' },
] as const satisfies ReadonlyArray<{ value: GdVersion; label: string }>

/**
 * PC / Mobile picker for the device a run was played on.
 *
 * Device is optional on every write path, so clicking the active option
 * clears it back to `null`.
 */
export function DevicePicker({
  value,
  onChange,
}: {
  value: Device | null
  onChange: (v: Device | null) => void
}) {
  return (
    <Segmented
      options={DEVICE_OPTIONS}
      value={value}
      onChange={onChange}
      allowDeselect
    />
  )
}

/**
 * 2.1 / 2.2 picker for which version's percentage semantics a percentage uses.
 *
 * Callers should hide this entirely for a pre-2.2 date — see `isPreTwoTwo` in
 * `./gdVersion`, which pins the basis to 2.1 and leaves nothing to pick.
 */
export function GdVersionPicker({
  value,
  onChange,
}: {
  value: GdVersion | null
  onChange: (v: GdVersion) => void
}) {
  return (
    <Segmented
      options={GD_VERSION_OPTIONS}
      value={value}
      onChange={(v) => v && onChange(v)}
    />
  )
}

/** The Info trigger explaining why 2.1 and 2.2 percentages differ, for use beside {@link GdVersionPicker}. */
export function GdVersionInfoButton() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="What is the percentage version?"
          className="inline-flex size-4 items-center justify-center rounded-full text-text-tertiary transition-colors hover:text-text-secondary"
        >
          <Info size={12} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[280px] space-y-2 p-4 text-sm">
        <p className="font-medium text-text-primary">2.1 vs 2.2 percentages</p>
        <p className="text-text-secondary">
          <span className="font-medium text-text-primary">2.1</span> measured
          progress by <span className="italic">distance</span> to the endwall —
          the counter moved faster through high-speed sections and slower
          through low-speed ones.
        </p>
        <p className="text-text-secondary">
          <span className="font-medium text-text-primary">2.2</span> uses{' '}
          <span className="italic">time</span> instead — 100% equals the
          duration of the verification attempt. The same position can show a
          noticeably different number between the two versions.
        </p>
      </PopoverContent>
    </Popover>
  )
}
