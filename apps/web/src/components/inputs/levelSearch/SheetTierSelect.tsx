import { SheetSourceChip, TierBadge } from '@/components/data/TierBadge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/generic/select'
import {
  ANY_SHEET_TIER,
  SHEET_TIER_OPTIONS,
  sheetTierFromSelect,
  sheetTierSelectValue,
} from './filterControls'

/**
 * The sheet-tier filter: one NLW/LW tier, picked by name. The tiers are named
 * categories rather than points on a scale, so this is a single choice, not a
 * range. Each entry is painted in its sheet colour and marked listworthy (LW)
 * or not (NLW), as the Global Level Page shows them.
 */
export function SheetTierSelect({
  value,
  onChange,
}: {
  value: number | undefined
  onChange: (tier: number | undefined) => void
}) {
  return (
    <Select
      value={sheetTierSelectValue(value)}
      onValueChange={(v) => onChange(sheetTierFromSelect(v))}
    >
      <SelectTrigger aria-label="Sheet tier" className="h-9 bg-bg-elevated">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY_SHEET_TIER}>Any tier</SelectItem>
        {SHEET_TIER_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            <span className="flex items-center gap-2">
              <TierBadge look={o.look} className="min-w-0 px-2 py-0.5" />
              <SheetSourceChip source={o.look.source} />
              {o.note && (
                <span className="text-[11px] text-text-tertiary">
                  {o.note}
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
