/**
 * Values `authMiddleware` puts on the Hono context for every authenticated
 * route.
 *
 * `userId` is the INTERNAL user UUID, not the Cognito sub — authenticated
 * routes must always read identity from here (`c.get('userId')`) and never
 * from a path segment or request payload. Because it is declared non-optional,
 * `c.get('userId')` is already typed `string`; no cast is needed at call sites.
 */
export type HonoVariables = {
  userId: string
  userEmail: string
  cognitoSub?: string
}
