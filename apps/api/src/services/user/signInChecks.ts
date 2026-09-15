// Account lookups the Settings sign-in routes share (routes/account/password.ts
// and routes/account/email.ts).

import prisma from '../../utils/prisma'
import { GoogleProofError, verifyGoogleProof } from '../../utils/googleProof'

/**
 * The account's email-and-password sign-in, or null when it has none.
 *
 * @param userId - The authenticated account.
 */
export async function findPasswordIdentity(userId: string) {
  return prisma.authIdentity.findFirst({
    where: { userId, provider: 'PASSWORD', cognitoSub: { not: null } },
    select: { id: true, email: true },
  })
}

/**
 * Verifies a Google re-confirmation and that it belongs to one of THIS
 * account's Google sign-ins. A valid proof for somebody else's Google account
 * proves nothing about the caller.
 *
 * @param userId - The authenticated account.
 * @param googleProof - The ID token the browser obtained.
 * @throws {GoogleProofError} When it is invalid, stale, or not the account's.
 */
export async function requireOwnGoogleProof(
  userId: string,
  googleProof: string
) {
  const proof = await verifyGoogleProof(googleProof)
  const owned = await prisma.authIdentity.findFirst({
    where: { userId, provider: 'GOOGLE', cognitoSub: proof.cognitoSub },
    select: { id: true },
  })
  if (!owned) throw new GoogleProofError('invalid')
  return proof
}

/**
 * Whether an address is already a different account's email.
 *
 * @param email - The address, lowercase.
 * @param userId - The account asking, which doesn't count.
 */
export async function emailBelongsToAnotherAccount(
  email: string,
  userId: string
): Promise<boolean> {
  const other = await prisma.user.findFirst({
    where: { email, NOT: { id: userId } },
    select: { id: true },
  })
  return other !== null
}
