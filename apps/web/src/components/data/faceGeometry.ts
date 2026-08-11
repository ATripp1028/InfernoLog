// How a difficulty face and its showcase glow are sized and seated inside the
// box DifficultyFace is given. Pure — the component owns the markup and reads
// these for its inline transforms.

import { levelGlow } from '@/lib/gdAssets'

// demon-extreme.png is the widest face crop (~160px native, since its horns
// spread the bounding box); plain difficulty faces are 120px. The on-screen
// face was tuned to look right on demon-extreme, so we treat its width as the
// reference and scale every face by the same native→display ratio. That keeps
// the actual face "ball" a consistent on-screen size across difficulties — and
// therefore keeps the glow sitting the same way behind all of them.
export const FACE_REFERENCE_WIDTH = 160

/** How much of the box the face itself fills, leaving room for the fire. */
const FACE_FILL = 0.6

/**
 * The scale to render a face sprite at inside a `size`-px box.
 *
 * demon-extreme fills ~60% of the box when glowed; every other face scales
 * from the same reference so its ball matches rather than each crop's own
 * native width deciding how big it looks.
 */
export function faceScale(size: number): number {
  return (size * FACE_FILL) / FACE_REFERENCE_WIDTH
}

/**
 * How far down to nudge the glow, in px.
 *
 * The face seats a few pixels above the glow's centre (the fire extends
 * further below than above). Moving the GLOW down rather than the face up
 * keeps the face at the box's vertical centre, so it lines up with adjacent
 * text when rendered inline.
 */
export function glowOffset(size: number): number {
  return Math.round(size * 0.08)
}

/**
 * The scale to render the glow sprite at.
 *
 * The feature-circle asset is drawn larger than the epic/legendary/mythic
 * fires, so at full size it overruns the face's horns.
 */
export function glowScale(
  epicValue: number | null | undefined,
  featured: boolean | null | undefined
): number {
  return levelGlow(epicValue, featured) === 'featured' ? 0.8 : 1
}

/**
 * Where the rated-star badge sits inside a `size`-px box, in px.
 */
export function ratedStarPlacement(size: number): {
  width: number
  bottom: number
  right: number
} {
  return {
    width: Math.round(size * 0.2),
    bottom: Math.round(size * 0.25),
    right: Math.round(size * 0.25),
  }
}
