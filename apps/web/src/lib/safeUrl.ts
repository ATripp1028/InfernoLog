/**
 * Schemes an `href` is allowed to carry. Anything else — `javascript:`,
 * `data:`, `vbscript:` — executes or renders in this origin when clicked.
 */
const SAFE_SCHEMES = ['http:', 'https:']

/**
 * A user-supplied URL, or `undefined` when it isn't safe to put in an `href`.
 *
 * Every URL rendered as a link here (completion videos, stream highlights,
 * song links) originated as text somebody typed. The API validates those with
 * `HttpUrlSchema` on write, and that is the real gate — but it is one gate,
 * added after rows already existed, and it does not cover the level metadata
 * that arrives from GD's servers and third-party APIs. React does not sanitize
 * `href`, so a single `javascript:` string reaching one of those links is
 * script execution in a logged-in session.
 *
 * `new URL` is the check rather than a regex because the browser's own parser
 * is what will resolve the href — matching its behavior exactly is the point.
 * It strips leading/trailing control characters and whitespace before parsing,
 * which is how `"java\tscript:alert(1)"` slips past anchored string tests.
 *
 * @param url - The candidate URL. `null`/`undefined` pass through as unsafe.
 * @returns The URL unchanged when it is an http(s) absolute URL, else `undefined`.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  try {
    return SAFE_SCHEMES.includes(new URL(url).protocol) ? url : undefined
  } catch {
    // Not an absolute URL at all — a relative path or plain text. Nothing in
    // this app links to a relative URL through user data, so reject it.
    return undefined
  }
}
