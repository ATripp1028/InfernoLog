/// <reference path="../.sst/platform/config.d.ts" />

// Set per stage with `npx sst secret set <NAME> <value>` — `.env` is only read
// by the Prisma CLI and local scripts, not by sst dev.
export const DATABASE_URL = new sst.Secret('DATABASE_URL')
export const DATABASE_URL_DIRECT = new sst.Secret('DATABASE_URL_DIRECT')
export const SENTRY_DSN = new sst.Secret('SENTRY_DSN')
export const GOOGLE_CLIENT_ID = new sst.Secret('GOOGLE_CLIENT_ID')
export const GOOGLE_CLIENT_SECRET = new sst.Secret('GOOGLE_CLIENT_SECRET')
export const DISCORD_CLIENT_ID = new sst.Secret('DISCORD_CLIENT_ID')
export const DISCORD_CLIENT_SECRET = new sst.Secret('DISCORD_CLIENT_SECRET')
// Signs the OAuth `state` for account linking. Deliberately NOT
// DISCORD_CLIENT_SECRET, which this used to reuse — see utils/discordState.ts
// for why the two lifecycles are worth keeping apart. Set it like any other:
//   npx sst secret set DISCORD_STATE_SECRET "$(openssl rand -hex 32)"
export const DISCORD_STATE_SECRET = new sst.Secret('DISCORD_STATE_SECRET')
