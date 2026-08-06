// Authentication and account creation.
//
//   discord.ts     GET  /auth/discord/callback        (public, unversioned)
//   onboarding.ts  POST /v1/auth/signup/start         (claims-only)
//                  POST /v1/auth/signin/reject        (claims-only)
//   state.ts       the signed Discord connect-state, shared with
//                  routes/account/discord.ts
//
// ⚠️ This module has NO default export, unlike every other route module.
// Its two route groups mount at different prefixes and neither can move:
//
//   • /auth/discord/callback is unversioned because the URL is registered with
//     Discord, and it is public because the browser arrives from Discord with
//     no Authorization header.
//   • /v1/auth/* are "claims-only": they verify the Cognito token but tolerate
//     a missing User row, since they run before one exists. They must be
//     registered ahead of authMiddleware, whose lookup would 404 first.
//
// A single default export would force both into one prefix, so src/index.ts
// imports and mounts the two named exports separately.

export { default as discordCallbackRoutes } from './discord'
export { default as onboardingRoutes } from './onboarding'
export {
  mintConnectDiscordState,
  verifyConnectDiscordState,
  type ConnectStatePayload,
} from './state'
