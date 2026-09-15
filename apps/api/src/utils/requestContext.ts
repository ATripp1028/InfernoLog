/**
 * The caller's source IP, as API Gateway saw it.
 *
 * Used only as rate-limit input, and only ever stored hashed
 * (`hashSourceIp` in services/verification). Falls back to `'unknown'`
 * outside API Gateway — local runs and tests without a request context — which
 * puts every such caller in one shared bucket.
 *
 * @param c - The Hono context; `c.env` is the Lambda event under API Gateway.
 */
export function sourceIp(c: { env: unknown }): string {
  const ip = (
    c.env as { requestContext?: { http?: { sourceIp?: unknown } } } | undefined
  )?.requestContext?.http?.sourceIp
  return typeof ip === 'string' && ip.length > 0 ? ip : 'unknown'
}
