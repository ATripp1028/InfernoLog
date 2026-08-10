// The "beat it solo / with a partner" choice plus its conditional partner
// field. Shared by the completion-logging step and the edit-level modal,
// which had byte-identical copies down to the button class strings.

import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'

const OPTIONS = [
  { value: 'solo', label: 'Beat it solo' },
  { value: 'partner', label: 'With a partner' },
] as const

/**
 * Two-player choice for a completion.
 *
 * @param solo - `true` solo, `false` with a partner, `null` when the user has
 * not answered. The partner field only appears on `false`.
 * @param partnerInputId - Ties the visible "Partner" label to the input; pass
 * one when the caller renders its own label.
 */
export function TwoPlayerPicker({
  solo,
  partner,
  onSoloChange,
  onPartnerChange,
  partnerInputId,
  partnerLabel,
}: {
  solo: boolean | null
  partner: string
  onSoloChange: (v: boolean) => void
  onPartnerChange: (v: string) => void
  partnerInputId?: string
  partnerLabel?: React.ReactNode
}) {
  return (
    <>
      <Segmented
        options={OPTIONS}
        value={solo === null ? null : solo ? 'solo' : 'partner'}
        onChange={(v) => onSoloChange(v === 'solo')}
        orientation="vertical"
        size="block"
      />
      {solo === false && (
        <div>
          {partnerLabel}
          <Input
            id={partnerInputId}
            value={partner}
            onChange={(e) => onPartnerChange(e.target.value)}
            placeholder="Partner's name (optional)"
            maxLength={100}
          />
        </div>
      )}
    </>
  )
}
