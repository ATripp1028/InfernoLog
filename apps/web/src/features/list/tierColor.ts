// GDDL tier → badge color. Mirrors the blue→green→orange→purple difficulty
// gradient used on the Figma tier slider (1 easiest … 35+ hardest). Bucketed
// for now; can be swapped for true interpolation later.
export function gddlTierColor(tier: number): string {
  if (tier <= 9) return '#3b82f6' // info blue
  if (tier <= 17) return '#22c55e' // success green
  if (tier <= 28) return '#f97316' // orange
  return '#932be0' // purple
}
