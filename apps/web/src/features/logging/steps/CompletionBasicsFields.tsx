// The two composite controls the completion step is built from. Both are thin
// wrappers that give the shared pickers this step's labelling and hints — the
// controls themselves live in src/components/ because the edit-level modal
// renders the same ones.

import { CoinPicker } from '@/components/inputs/CoinPicker'
import { TwoPlayerPicker } from '@/components/inputs/TwoPlayerPicker'
import type { Level } from '@/lib/api/logging'
import { FieldHint, FieldLabel } from '../components'

/** The completion step's coin control: a framed {@link CoinPicker} plus its hint. */
export function CoinsSection({
  level,
  collected,
  onChange,
}: {
  level: Level
  collected: number
  onChange: (bitmask: number) => void
}) {
  return (
    <div className="space-y-3">
      <FieldLabel>Coins</FieldLabel>
      <CoinPicker
        level={level}
        collected={collected}
        onChange={onChange}
        variant="framed"
      />
      <FieldHint>Click a coin to mark it as collected.</FieldHint>
    </div>
  )
}

/** The completion step's 2-player control. */
export function TwoPlayerSection({
  solo,
  partner,
  onSoloChange,
  onPartnerChange,
}: {
  solo: boolean | null
  partner: string
  onSoloChange: (v: boolean) => void
  onPartnerChange: (v: string) => void
}) {
  return (
    <div className="space-y-3">
      <FieldLabel>2-Player</FieldLabel>
      <TwoPlayerPicker
        solo={solo}
        partner={partner}
        onSoloChange={onSoloChange}
        onPartnerChange={onPartnerChange}
        partnerInputId="c-partner"
        partnerLabel={<FieldLabel htmlFor="c-partner">Partner</FieldLabel>}
      />
    </div>
  )
}
