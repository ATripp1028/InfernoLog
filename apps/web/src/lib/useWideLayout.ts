import { useMediaQuery } from './useMediaQuery'

/**
 * When a page may use its two-column layout: wide enough for a main column
 * beside a fixed-width side panel, *and* tall enough for that layout to have
 * somewhere to put the rows it stacks up.
 *
 * Width alone is not enough. A phone in landscape (844×390, say) clears the
 * `md` breakpoint, so a width-only test hands it the desktop layout — where a
 * ~425px side panel leaves the main column too narrow to read and the page is
 * several viewport-heights tall. The height term keeps those on the mobile
 * layout while leaving every tablet in landscape (≥744px tall) on the wide one.
 */
export const WIDE_LAYOUT_QUERY = '(min-width: 768px) and (min-height: 500px)'

/**
 * Whether the viewport currently qualifies for a two-column page layout.
 *
 * Pages branching on this must render one layout or the other — never both
 * with one hidden in CSS. A hidden subtree is still mounted, and mounted
 * media (the level page's completion-video iframe) keeps playing behind the
 * visible one, so rotating the device left two copies able to play at once.
 */
export function useWideLayout(): boolean {
  return useMediaQuery(WIDE_LAYOUT_QUERY)
}

/**
 * Sizing for the full-bleed 16:9 hero at the top of the mobile level pages —
 * the completion video and the community thumbnail.
 *
 * A fixed height was fine while only a portrait phone ever saw this layout. It
 * is not now that a phone in landscape gets it too: at 844px across, a 219px
 * box letterboxes the video into a strip, and an uncapped `aspect-video` box
 * is 475px tall on a 390px-tall viewport, pushing the whole page below the
 * fold. Capping the *width* keeps the box 16:9 while bounding its height, and
 * `mx-auto` centres what's left over.
 */
export const MOBILE_HERO_CLASS =
  'mx-auto aspect-video w-full max-w-[calc(80svh_*_1.778)]'
