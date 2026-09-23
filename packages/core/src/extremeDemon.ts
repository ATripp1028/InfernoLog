// Whether a level is an Extreme Demon — the one difficulty question both apps
// have to answer identically. See isExtremeDemon.

/** The fields {@link isExtremeDemon} reads. */
interface ExtremeDemonSource {
  /** RobTop's machine-readable difficulty token ("demon-extreme"). */
  partialDiff: string | null
  /** The display label ("Extreme Demon"), for rows cached before the token. */
  inGameDifficulty: string | null
}

/**
 * Whether a level is currently an Extreme Demon.
 *
 * Shared because it decides one thing on both sides of the wire: which
 * community source supplies the level's enjoyment rating. Extremes take EDEL's
 * score, everything at Insane and below takes GDDL's — so the API picks the
 * value with this and the frontend labels its origin with the same call, and
 * the two cannot drift into disagreeing about a level.
 *
 * Reads `partialDiff` first, matching by PREFIX rather than equality: the token
 * has a `-featured` variant, and an exact match would silently miss every
 * featured extreme. Falls back to the display label for rows cached before that
 * column existed, normalizing punctuation and case because the label reaches us
 * as both "Extreme Demon" and "EXTREME_DEMON".
 */
export function isExtremeDemon(level: ExtremeDemonSource): boolean {
  if (level.partialDiff != null) {
    return level.partialDiff.startsWith('demon-extreme')
  }
  const label = level.inGameDifficulty?.toLowerCase().replace(/[^a-z]/g, '')
  return label === 'extremedemon'
}
