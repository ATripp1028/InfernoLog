// The `me` payload: what every endpoint returning the authenticated user
// selects, and how it is shaped for the wire.
//
// Single-copy on purpose. serializeMe is the boundary that strips
// gddlApiKeyEncrypted — a second copy that forgot to would leak the stored
// GDDL key's ciphertext to the client, so profile.ts, gddlKey.ts and
// ratings.ts all share this one.

import { Prisma } from '@prisma/client'

export const meSelect = {
  id: true,
  username: true,
  usernameChangedAt: true,
  email: true,
  discordId: true,
  profilePublic: true,
  discordPublic: true,
  ratingMode: true,
  ratingDisplayScale: true,
  defaultFps: true,
  defaultPercentageVersion: true,
  defaultDevice: true,
  dateFormatPreference: true,
  showHighlightUrl: true,
  autoExpandFabLabels: true,
  includeEnjoyment: true,
  enjoymentWeight: true,
  enjoymentSortOrder: true,
  // Selected only to derive the `hasGddlApiKey` boolean — the ciphertext
  // itself is stripped in serializeMe and never sent to clients.
  gddlApiKeyEncrypted: true,
  // Public GDDL account name — safe to return.
  gddlUsername: true,
  onboardingCompleted: true,
  legalAcceptedAt: true,
  verifiedAt: true,
  createdAt: true,
} as const

// meSelect plus the user's ordered rating categories. Every route that returns
// the full `me` payload uses this; it was written out identically in six
// places before the account routes were split across files.
export const meWithCategoriesSelect = {
  ...meSelect,
  ratingCategories: {
    select: { id: true, name: true, weight: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  },
} satisfies Prisma.UserSelect

export type RawUser = {
  enjoymentWeight: { toNumber(): number } | number
  gddlApiKeyEncrypted?: string | null
  verifiedAt?: Date | null
  ratingCategories?: Array<{
    id: string
    name: string
    weight: { toNumber(): number } | number
    sortOrder: number
  }>
  [key: string]: unknown
}

// Prisma returns Decimal as a Decimal instance; the wire shape uses plain numbers.
export function serializeMe(user: RawUser) {
  // gddlApiKeyEncrypted is destructured out so it can never leak to the client;
  // we expose only whether a key is set.
  const {
    enjoymentWeight,
    ratingCategories,
    gddlApiKeyEncrypted,
    verifiedAt,
    ...rest
  } = user
  return {
    ...rest,
    hasGddlApiKey: Boolean(gddlApiKeyEncrypted),
    isVerified: verifiedAt != null,
    enjoymentWeight:
      typeof enjoymentWeight === 'number'
        ? enjoymentWeight
        : enjoymentWeight.toNumber(),
    ratingCategories: (ratingCategories ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      weight: typeof c.weight === 'number' ? c.weight : c.weight.toNumber(),
    })),
  }
}
