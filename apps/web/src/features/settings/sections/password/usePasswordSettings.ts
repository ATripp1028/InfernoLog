import type { MeData } from '@/lib/api/me'
import { findPasswordIdentity } from '../connectedAccounts'

/**
 * Which password form the account gets.
 */
export function usePasswordSettings(me: MeData) {
  return { hasPassword: findPasswordIdentity(me.identities) !== undefined }
}
