/// <reference path="../.sst/platform/config.d.ts" />

import { sharedNodeOptions } from './defaults'
import {
  DATABASE_URL,
  DATABASE_URL_DIRECT,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  SENTRY_DSN,
} from './secrets'

// ─────────────────────────────────────────────
// AUTH — Cognito User Pool
// ─────────────────────────────────────────────
export const userPool = new sst.aws.CognitoUserPool('InfernoLogUserPool', {
  usernames: ['email'],
  triggers: {
    postAuthentication: {
      handler: 'src/triggers/postAuthentication.handler',
      link: [DATABASE_URL, DATABASE_URL_DIRECT, SENTRY_DSN],
      environment: {
        DATABASE_URL: DATABASE_URL.value,
        DATABASE_URL_DIRECT: DATABASE_URL_DIRECT.value,
        SENTRY_DSN: SENTRY_DSN.value,
      },
      ...sharedNodeOptions,
    },
  },
})

new aws.cognito.UserPoolDomain('InfernoLogDomain', {
  domain:
    $app.stage === 'production' ? 'infernolog' : `infernolog-${$app.stage}`,
  userPoolId: userPool.id,
})

const googleProvider = new aws.cognito.IdentityProvider('GoogleProvider', {
  userPoolId: userPool.id,
  providerName: 'Google',
  providerType: 'Google',
  providerDetails: {
    client_id: GOOGLE_CLIENT_ID.value,
    client_secret: GOOGLE_CLIENT_SECRET.value,
    authorize_scopes: 'email openid profile',
  },
  attributeMapping: {
    email: 'email',
    name: 'name',
    username: 'sub',
  },
})

export const userPoolClient = new aws.cognito.UserPoolClient(
  'InfernoLogWebClient',
  {
    name: 'InfernoLogWebClient',
    userPoolId: userPool.id,
    generateSecret: false,
    allowedOauthFlows: ['code'],
    allowedOauthFlowsUserPoolClient: true,
    allowedOauthScopes: ['email', 'openid', 'profile'],
    callbackUrls: [
      'http://localhost:5173/auth/callback',
      'https://infernolog.com/auth/callback',
      ...($app.stage !== 'production' && $app.stage !== 'alextripp'
        ? [`https://d1r4gy6uhfg2w9.cloudfront.net/auth/callback`]
        : []),
    ],
    logoutUrls: [
      'http://localhost:5173',
      'https://infernolog.com',
      'http://localhost:5173/no-account-found',
      'https://infernolog.com/no-account-found',
      ...($app.stage !== 'production' && $app.stage !== 'alextripp'
        ? [
            `https://d1r4gy6uhfg2w9.cloudfront.net`,
            `https://d1r4gy6uhfg2w9.cloudfront.net/no-account-found`,
          ]
        : []),
    ],
    defaultRedirectUri: 'http://localhost:5173/auth/callback',
    supportedIdentityProviders: ['Google', 'COGNITO'],
    explicitAuthFlows: ['ALLOW_REFRESH_TOKEN_AUTH'],
  },
  { dependsOn: [googleProvider] }
)

// ─────────────────────────────────────────────
// E2E APP CLIENT — non-production stages only
//
// The Playwright suite (docs/E2E_TESTING.md) needs a Cognito session without
// driving Google's OAuth flow in a browser, so it signs a dedicated native
// user in with ADMIN_USER_PASSWORD_AUTH. That flow is deliberately NOT added
// to InfernoLogWebClient: the client the real frontend ships with must never
// have a password flow enabled. It lives on its own client instead, and
// infra/api.ts widens the authorizer audience to accept it.
//
// Guarded on stage, not on an env var — a misread env var would silently
// widen production's trust boundary. On production this is `undefined` and
// the audience list stays exactly one.
// ─────────────────────────────────────────────
export const e2eClient =
  $app.stage === 'production'
    ? undefined
    : new aws.cognito.UserPoolClient('InfernoLogE2eClient', {
        name: 'InfernoLogE2eClient',
        userPoolId: userPool.id,
        generateSecret: false,
        // No OAuth flows at all: this client exists solely for the admin
        // password flow, which API Gateway's authorizer accepts by audience.
        allowedOauthFlowsUserPoolClient: false,
        supportedIdentityProviders: ['COGNITO'],
        // ADMIN_USER_PASSWORD_AUTH requires AWS credentials to call, which
        // only CI and developers have. REFRESH_TOKEN_AUTH is here so Amplify
        // can refresh mid-run rather than failing a long spec at the 60-minute
        // token expiry.
        explicitAuthFlows: [
          'ALLOW_ADMIN_USER_PASSWORD_AUTH',
          'ALLOW_REFRESH_TOKEN_AUTH',
        ],
      })
