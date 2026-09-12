/**
 * Which page a level row leads to. The two looks are deliberately different —
 * see {@link RowHoverGlow}.
 */
export type RowGlowVariant = 'progress' | 'global'

/**
 * The hover glow on a level row, and the convention it encodes.
 *
 * The colour tells a reader, before they click, WHOSE page the row opens:
 *
 * - `progress` — warm gold, the app's own accent. The row opens the viewer's
 *   page for the level (`/log/$levelId`): their attempts, runs and rating.
 *   Used by the demon list.
 * - `global` — neutral white. The row opens the level's Global Level Page
 *   (`/levels/$levelId`), which is the same for every viewer. Used by the
 *   /search results and by collection rows.
 *
 * So the two are NOT interchangeable and must not be merged into one look: the
 * difference is the whole point. A new level row picks its variant from where
 * it links, not from how it wants to look.
 *
 * Renders an absolutely-positioned overlay, so the row needs `relative` and
 * `overflow-hidden`, and content above it needs a z-index. The element is
 * inert (`aria-hidden`, `pointer-events-none`) — it is paint, not a target.
 */
export function RowHoverGlow({ variant }: { variant: RowGlowVariant }) {
  if (variant === 'progress') {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ boxShadow: 'inset 0 0 40px rgba(255, 159, 28, 0.22)' }}
      />
    )
  }
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-white/0 transition-colors group-hover:bg-white/[0.04]"
    />
  )
}
