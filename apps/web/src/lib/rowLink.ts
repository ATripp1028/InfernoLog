// How a level row stays one big click target while still holding controls of
// its own (copy the id, remove, drag).
//
// The obvious structure — wrap the whole row in a <Link> — cannot work: a
// <button> inside an <a> is invalid markup, and the click lands on the anchor
// instead of the button, so any control nested in the row is broken. Nesting
// also makes the link's accessible name the row's entire text, so a screen
// reader announces "Tidal Wave Published by OniLink 14,231 att GDDL tier 34…"
// as the link.
//
// So the row does it the other way round: the link wraps ONLY the level's
// name, and a pseudo-element stretches its hit area over the whole row. Every
// other control is a SIBLING of the link, lifted above that pseudo-element.
// The row still navigates from anywhere, the link is named by the level, and
// the controls are real buttons.

/**
 * Stretches a row's link (or button) over the whole row, so a click anywhere
 * that is not another control activates it.
 *
 * Put it on the element wrapping the level's NAME. The `inset-0` resolves
 * against the nearest positioned ancestor, so the row needs exactly one
 * `relative` wrapper around its content — that wrapper is what gets covered.
 *
 * `content-['']` is explicit rather than relying on the framework defaulting
 * it: without content the pseudo-element does not render at all, and the
 * failure is silent — the row simply stops being clickable.
 */
export const ROW_LINK_STRETCH =
  "after:absolute after:inset-0 after:content-['']"

/**
 * Lifts one of a row's own controls above {@link ROW_LINK_STRETCH}'s
 * pseudo-element, so clicking it does that control's job instead of following
 * the row.
 *
 * Every interactive sibling of a stretched link needs this — a drag handle, a
 * remove button, the id's copy button. Miss one and it silently becomes
 * another way to open the row.
 */
export const ROW_CONTROL = 'relative z-10'
