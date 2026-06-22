import { gddlTier } from './filtering'
import { gddlTierColor } from './tierColor'
import type { ListItem } from './types'

// The faint difficulty-colored wash + dark readability overlay shared by the
// columnar row and the mobile card. Approximate; refined later.
export function RowWash({ item }: { item: ListItem }) {
  const tier = gddlTier(item)
  const accent = tier != null ? gddlTierColor(tier) : '#3a3a4a'
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0 opacity-30"
        style={{ background: `linear-gradient(90deg, ${accent} 0%, #141a26 100%)` }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, rgba(13,13,13,0.92) 0%, rgba(13,13,13,0.65) 50%, rgba(13,13,13,0.85) 100%)',
        }}
      />
    </>
  )
}
