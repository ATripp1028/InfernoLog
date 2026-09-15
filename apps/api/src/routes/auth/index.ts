// Authentication and account creation.
//
//   discord.ts     GET  /auth/discord/callback        (public, unversioned)
//   onboarding.ts      POST /v1/auth/signup/start              (claims-only)
//                      POST /v1/auth/signin/reject             (claims-only)
//   passwordSignup.ts  POST /v1/auth/password-signup/start     (public)
//                      POST /v1/auth/password-signup/verify    (public)
//
// The signed connect-state helpers both Discord routes rely on live in
// utils/discordState.ts — they are shared with routes/account/discord.ts and
// are not route definitions.
//
// ⚠️ This module has NO default export, unlike every other route module.
// Its route groups mount at different prefixes, and none can move:
//
//   • /auth/discord/callback is unversioned because the URL is registered with
//     Discord, and it is public because the browser arrives from Discord with
//     no Authorization header.
//   • /v1/auth/signup/start and /signin/reject are "claims-only": they verify
//     the Cognito token but tolerate a missing User row, since they run before
//     one exists. They must be registered ahead of authMiddleware, whose
//     lookup would 404 first.
//   • /v1/auth/password-signup/* are fully public — no token exists until the
//     address is verified — so they also sit ahead of authMiddleware.
//
// A single default export would force them into one prefix, so src/index.ts
// imports and mounts each named export separately.

export { default as discordCallbackRoutes } from './discord'
export { default as onboardingRoutes } from './onboarding'
export { default as passwordSignupRoutes } from './passwordSignup'
