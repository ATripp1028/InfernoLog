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
