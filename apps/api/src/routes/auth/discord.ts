// GET /auth/discord/callback — the public OAuth redirect target.
//
// Mounted at /auth (NOT /v1) because the URL is registered with Discord, and
// public because Discord sends the browser here directly with no Authorization
// header.
//
// THIS ROUTE IS A BOUNCER. It hands the `code` and `state` to the frontend and
// does nothing else — no token exchange, no Discord call, no database write.
//
// It used to do all of those, and that was the flaw. Its only evidence about
// who was linking was the signed state, which proves a userId was minted by us
// but not that the browser presenting it belongs to that user. So an attacker
// could mint a state for their own account, hand the authorize URL to a victim,
// and have the victim's approved Discord identity written onto the attacker's
// profile — a classic OAuth account-linking CSRF. Because `discordId` is
// unique, that also permanently blocked the victim from ever linking their own.
//
// A confirmation step would not have fixed it: whatever this route resolves is
// keyed to the state's userId, so the attacker could simply confirm it himself.
// The exchange itself has to happen under a JWT. It now does, in
// POST /v1/me/connect-discord/complete (routes/account/discord.ts), which
// refuses unless the state's userId matches the authenticated caller.
//
// That inverts who can finish the flow. The `code` is delivered to whichever
// browser completed the Discord consent screen, and spending it requires being
// signed in as the account the state names — so the two have to be the same
// person. In the attack above the victim's browser now receives the code, the
// victim's JWT does not match the attacker's state, and the request is refused;
// the attacker never sees the code, which is single-use and short-lived.
//
// The code does pass through the browser as a query parameter, which is
// standard for OAuth in a SPA (the client secret stays server-side, and the
// code is useless without it). It is visible in the address bar only for the
// duration of the completion request: apps/web/src/pages/DiscordLinkComplete.tsx
// renders nothing but a spinner and then leaves for /settings with
// `replace: true`, so no history entry retains it.

import { Hono } from 'hono'
import type { HonoVariables } from '../../types/hono'

const app = new Hono<{ Variables: HonoVariables }>()

// GET /auth/discord/callback?code=...&state=...
//   • on approval  → /auth/discord/complete?code=…&state=… (authenticated page)
//   • on denial or a malformed redirect → /settings?discord=error&reason=…
//
// The state is deliberately NOT verified here. It is verified once, at the
// authenticated endpoint that acts on it, so there is a single place that
// decides whether a state is trustworthy. Checking it here as well would
// duplicate that decision without adding a guarantee — this route grants
// nothing, so there is nothing for a bad state to obtain from it.
app.get('/discord/callback', (c) => {
  const frontendUrl = process.env.FRONTEND_URL!
  const fail = (reason: string) =>
    c.redirect(`${frontendUrl}/settings?discord=error&reason=${reason}`)

  // Discord reports a declined consent screen as ?error=access_denied.
  if (c.req.query('error')) return fail('cancelled')

  const code = c.req.query('code')
  const state = c.req.query('state')
  if (!code) return fail('missing_code')
  if (!state) return fail('missing_state')

  const params = new URLSearchParams({ code, state })
  return c.redirect(`${frontendUrl}/auth/discord/complete?${params}`)
})

export default app
