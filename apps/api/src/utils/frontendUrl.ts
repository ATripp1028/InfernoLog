/**
 * The frontend's origin, for links in emails. Set per stage as `FRONTEND_URL`
 * by infra; production's origin when unset.
 */
export function frontendUrl(): string {
  return process.env.FRONTEND_URL ?? 'https://infernolog.com'
}
