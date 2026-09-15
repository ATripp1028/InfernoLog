/**
 * An email with its local part reduced to the first character, for showing on
 * a page that may be on stream: `sp0rk@proton.me` → `s••••@proton.me`.
 *
 * The domain stays readable so the owner can still tell addresses apart. A
 * value that isn't an address is masked whole.
 *
 * @param email - The address to mask.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) return '••••'
  return `${email[0]}••••${email.slice(at)}`
}
