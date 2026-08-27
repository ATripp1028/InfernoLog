// GDDL tier → badge color, interpolated from GDDL's own tier color anchors
// (tier, [r,g,b]). Tiers between anchors are linearly interpolated; outside the
// range clamps to the nearest anchor.
const ANCHORS: Array<[tier: number, rgb: [number, number, number]]> = [
  [1, [222, 223, 237]],
  [6, [207, 178, 219]],
  [11, [206, 123, 152]],
  [16, [202, 81, 62]],
  [21, [150, 57, 30]],
  [26, [108, 39, 17]],
  [31, [72, 17, 6]],
  [36, [56, 11, 47]],
  [39, [33, 8, 46]],
]

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)

function tierRgb(tier: number): [number, number, number] {
  const first = ANCHORS[0]!
  const last = ANCHORS[ANCHORS.length - 1]!
  if (tier <= first[0]) return first[1]
  if (tier >= last[0]) return last[1]
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [lo, loRgb] = ANCHORS[i]!
    const [hi, hiRgb] = ANCHORS[i + 1]!
    if (tier >= lo && tier <= hi) {
      const t = (tier - lo) / (hi - lo)
      return [
        lerp(loRgb[0], hiRgb[0], t),
        lerp(loRgb[1], hiRgb[1], t),
        lerp(loRgb[2], hiRgb[2], t),
      ]
    }
  }
  return last[1]
}

/**
 * The badge color for a GDDL tier, interpolated along the difficulty gradient.
 *
 * Tiers 1–15 land on light backgrounds, so callers render their number in
 * black; the palette only darkens from 16 up.
 */
export function gddlTierColor(tier: number): string {
  const [r, g, b] = tierRgb(tier)
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * CSS gradient across a tier slider domain, sampling the anchor colors at each
 * anchor's position within [min, max] (clamped to the ends).
 */
export function gddlTrackGradient(min: number, max: number): string {
  const span = Math.max(1, max - min)
  const stops = ANCHORS.map(([tier]) => {
    const pct = Math.max(0, Math.min(1, (tier - min) / span)) * 100
    return `${gddlTierColor(tier)} ${pct.toFixed(1)}%`
  })
  return `linear-gradient(90deg, ${stops.join(', ')})`
}
