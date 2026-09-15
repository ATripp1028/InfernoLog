// What the Connected accounts list shows, derived from the user's identities.
// Pure, so AccountSection's rows can be tested without rendering it.

import { findDiscordIdentity, type AuthIdentity } from '@/lib/api/me'
import type { AuthProvider } from '@/lib/api/wireEnums'

/** How each provider is named in the list. */
const PROVIDER_NAMES: Record<AuthProvider, string> = {
  GOOGLE: 'Google',
  PASSWORD: 'Email and password',
  DISCORD: 'Discord',
}

/** One way the user can sign in, as a row in the Connected accounts list. */
export interface SignInMethodRow {
  id: string
  provider: AuthProvider
  providerName: string
  // What the row identifies the account by: the email the provider asserted.
  identifier: string | null
  // Whether it can be removed: only while another way to sign in remains. The
  // API enforces the same rule; this only decides whether to offer it.
  canRemove: boolean
}

/**
 * The identities the user can sign in with, oldest first.
 *
 * Built from `canSignIn`, not from the provider, so an account shows exactly
 * the methods that actually work for it — and a Discord identity would appear
 * here on its own once Discord sign-in exists.
 */
export function signInMethodRows(
  identities: AuthIdentity[]
): SignInMethodRow[] {
  const signIns = identities.filter((identity) => identity.canSignIn)
  return signIns.map((identity) => ({
    id: identity.id,
    provider: identity.provider,
    providerName: PROVIDER_NAMES[identity.provider],
    identifier: identity.email,
    canRemove: signIns.length > 1,
  }))
}

/**
 * Whether the account can sign in with Google — when it can't, the list offers
 * to connect a Google account instead.
 */
export function hasGoogleSignIn(identities: AuthIdentity[]): boolean {
  return identities.some(
    (identity) => identity.provider === 'GOOGLE' && identity.canSignIn
  )
}

/**
 * The account's email-and-password sign-in, or undefined when it has none —
 * which decides whether Settings offers to change a password or add one.
 */
export function findPasswordIdentity(
  identities: AuthIdentity[]
): AuthIdentity | undefined {
  return identities.find(
    (identity) => identity.provider === 'PASSWORD' && identity.canSignIn
  )
}

/**
 * The linked Discord account as the list names it.
 *
 * @returns `Discord ID <id>` when a Discord account is linked, or null when
 *   none is — which the row renders as "Not connected" beside a Connect button.
 */
export function discordIdentifier(identities: AuthIdentity[]): string | null {
  const discord = findDiscordIdentity(identities)
  return discord?.providerAccountId
    ? `Discord ID ${discord.providerAccountId}`
    : null
}
