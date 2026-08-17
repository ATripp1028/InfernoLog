// The environment the E2E suite runs against, read once and validated loudly.
//
// Two layers of variables:
//
//  - Inputs, supplied by the caller (CI secrets, or a developer's shell).
//    E2E_STAGE has no default on purpose: pointing this suite at a stage
//    RESETS that stage's E2E user data, so the target is never inferred.
//  - Stage config, resolved from SSM by run.ts and handed down to the
//    Playwright process as E2E_API_URL / E2E_USER_POOL_ID / E2E_CLIENT_ID.
//    They are read here rather than re-fetched so the config, the global
//    setup, and the app build can never disagree about which stage they are on.

/** Where the suite drives the browser. */
export const BASE_URL = 'http://localhost:5173'

/**
 * Names of the SSM parameters run.ts resolves, keyed by the environment
 * variable each becomes. Parameters live under `/infernolog/<stage>/`.
 */
export const STAGE_PARAMETERS = {
  E2E_API_URL: 'api-url',
  E2E_USER_POOL_ID: 'user-pool-id',
  // `e2e-client-id` exists only on non-production stages, because the app
  // client it names does (apps/api/infra/auth.ts guards it on stage). A
  // ParameterNotFound on this one is what "you pointed the suite at
  // production" looks like from the runner.
  E2E_CLIENT_ID: 'e2e-client-id',
  E2E_COGNITO_DOMAIN: 'cognito-domain',
} as const

/** Every value the suite needs, once validation has passed. */
export interface E2eEnv {
  stage: string
  email: string
  password: string
  apiUrl: string
  userPoolId: string
  clientId: string
  cognitoDomain: string
}

function require_(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. The E2E suite is run through \`pnpm test:e2e\` (see e2e/run.ts), which resolves stage config from SSM rather than taking it from the environment directly.`
    )
  }
  return value
}

/**
 * The stage to run against. Required, with no default, and never production:
 * the suite resets its user's data before every run, so a misresolved stage is
 * destructive rather than merely wrong.
 */
export function requireStage(): string {
  const stage = process.env.E2E_STAGE
  if (!stage) {
    throw new Error(
      'E2E_STAGE is required and has no default. Set it to the stage you mean, e.g. E2E_STAGE=staging.'
    )
  }
  if (stage === 'production') {
    throw new Error(
      'Refusing to run: the E2E suite must never point at production.'
    )
  }
  return stage
}

/**
 * Reads and validates the full environment. Throws with the missing variable
 * named rather than letting a spec fail later on an empty API URL.
 */
export function readE2eEnv(): E2eEnv {
  return {
    stage: requireStage(),
    email: require_('E2E_USER_EMAIL'),
    password: require_('E2E_USER_PASSWORD'),
    // Trailing slash stripped so `${apiUrl}/v1/me` never doubles up.
    apiUrl: require_('E2E_API_URL').replace(/\/$/, ''),
    userPoolId: require_('E2E_USER_POOL_ID'),
    clientId: require_('E2E_CLIENT_ID'),
    cognitoDomain: require_('E2E_COGNITO_DOMAIN'),
  }
}
