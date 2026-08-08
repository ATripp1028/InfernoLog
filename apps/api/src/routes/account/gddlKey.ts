// The stored GDDL API key:
//
//   PUT    /v1/me/gddl-key
//   DELETE /v1/me/gddl-key
//
// The key is encrypted with AWS KMS before it touches the database and is
// NEVER logged — not the plaintext, not the ciphertext. Responses carry only
// the derived `hasGddlApiKey` flag (see serialize.ts).
//
// The two inner try/catches below are deliberate: each translates one expected
// upstream failure (GDDL rejecting the key, the GDDL account already being
// linked elsewhere) into a user-facing status. Everything else propagates to
// the module's onError — errors from KMS/Prisma/GDDL never carry the plaintext
// key, so reporting them is safe.

import { Hono } from 'hono'
import { SetGddlApiKeySchema } from '@infernolog/core'
import prisma from '../../utils/prisma'
import { isUniqueViolation } from '../../middleware/errors'
import { logger } from '../../utils/logger'
import { encryptSecret } from '../../utils/kms'
import { verifyGddlApiKey, GddlInvalidKeyError } from '../../utils/gddl'
import type { HonoVariables } from '../../types/hono'
import {
  meWithCategoriesSelect,
  serializeMe,
  type RawUser,
} from '../../services/user/serialize'

const app = new Hono<{ Variables: HonoVariables }>()

// PUT /v1/me/gddl-key — store (or replace) the user's GDDL API key.
app.put('/me/gddl-key', async (c) => {
  const userId = c.get('userId')

  const body = await c.req.json().catch(() => ({}))
  const parsed = SetGddlApiKeySchema.safeParse(body)
  if (!parsed.success) {
    // Return a static message — never echo the submitted body, which
    // contains the secret.
    return c.json({ error: 'A valid API key is required' }, 400)
  }

  // Verify the key against GDDL before storing it. A key GDDL rejects is
  // treated as invalid and never saved; only GDDL-confirmed keys persist.
  let gddlName: string
  try {
    ;({ name: gddlName } = await verifyGddlApiKey(parsed.data.apiKey))
  } catch (verifyError) {
    if (verifyError instanceof GddlInvalidKeyError) {
      return c.json(
        {
          error:
            'That GDDL API key is invalid. Double-check it on GDDL and try again.',
        },
        400
      )
    }
    // Network/timeout reaching GDDL — a server error, not an "invalid key".
    // Rethrown to the module's onError.
    throw verifyError
  }

  const gddlApiKeyEncrypted = await encryptSecret(parsed.data.apiKey)

  let updated
  try {
    updated = await prisma.user.update({
      where: { id: userId },
      data: { gddlApiKeyEncrypted, gddlUsername: gddlName },
      select: meWithCategoriesSelect,
    })
  } catch (err) {
    // P2002: this GDDL account is already linked to a different user.
    if (isUniqueViolation(err)) {
      logger.warn(
        { userId, gddlName },
        'GDDL account already linked to another user'
      )
      return c.json(
        {
          error:
            'That GDDL account is already connected to a different InfernoLog user.',
        },
        409
      )
    }
    throw err
  }

  // Log the event but never the key (or its ciphertext).
  logger.info({ userId }, 'Stored GDDL API key')
  return c.json({ data: serializeMe(updated as RawUser), gddlName })
})

// DELETE /v1/me/gddl-key — remove the stored GDDL API key.
app.delete('/me/gddl-key', async (c) => {
  const userId = c.get('userId')

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { gddlApiKeyEncrypted: null, gddlUsername: null },
    select: meWithCategoriesSelect,
  })

  logger.info({ userId }, 'Removed GDDL API key')
  return c.json({ data: serializeMe(updated as RawUser) })
})

export default app
