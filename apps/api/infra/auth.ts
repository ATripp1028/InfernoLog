/// <reference path="../.sst/platform/config.d.ts" />

import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from './secrets'
import {
  EMAIL_FROM,
  EMAIL_REPLY_TO,
  SES_DOMAIN,
  awsAccountId,
  sesIdentityArn,
} from './email'

// ─────────────────────────────────────────────
// SES sending authorization for Cognito
//
// With `emailSendingAccount: 'DEVELOPER'`, Cognito sends forgot-password
// emails as our SES identity, and the identity has to authorize that. The
// console adds this policy automatically; through the API it has to be
// declared. The identity itself is made by hand (see infra/email.ts) — only
// this policy, named per stage, is managed here, so stages never touch each
// other's.
//
// Scoped by source account rather than by this pool's ARN: the pool's
// emailConfiguration needs the policy to exist first, so referencing the
// pool's ARN here would be a cycle.
// ─────────────────────────────────────────────
const cognitoSesPolicy = new aws.sesv2.EmailIdentityPolicy(
  'CognitoSesSendingPolicy',
  {
    emailIdentity: SES_DOMAIN,
    policyName: `infernolog-cognito-${$app.stage}`,
    policy: $jsonStringify({
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'AllowCognitoToSend',
          Effect: 'Allow',
          Principal: { Service: 'cognito-idp.amazonaws.com' },
          Action: ['ses:SendEmail', 'ses:SendRawEmail'],
          Resource: sesIdentityArn,
          Condition: { StringEquals: { 'aws:SourceAccount': awsAccountId } },
        },
      ],
    }),
  }
)

// ─────────────────────────────────────────────
// AUTH — Cognito User Pool
// ─────────────────────────────────────────────
export const userPool = new sst.aws.CognitoUserPool('InfernoLogUserPool', {
  usernames: ['email'],
  // SST's default is `allowAdminCreateUserOnly: false`, which leaves Cognito's
  // unauthenticated SignUp API open to anyone holding the app client id — and
  // that id is public by construction (it is baked into the frontend bundle,
  // and this repo is open source). Nothing legitimate uses that API: Google
  // accounts arrive through federation, which is unaffected by this setting,
  // and email-and-password accounts are created by the API with
  // AdminCreateUser only after the address is verified (IAM-authed, also
  // unaffected), as is the E2E user. Left open, it lets anyone mint unlimited native users in
  // the pool and make Cognito send a confirmation email to any address they
  // name — an email-bombing primitive with InfernoLog's sender reputation
  // behind it.
  transform: {
    userPool: (args, opts) => {
      args.adminCreateUserConfig = { allowAdminCreateUserOnly: true }
      // Mirrors PASSWORD_RULES in packages/core/src/credentials.ts, which the
      // API and the web checklist validate against — change both together.
      // Written out rather than left to Cognito's defaults, which happen to
      // match today but are not ours to rely on.
      args.passwordPolicy = {
        minimumLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireNumbers: true,
        requireSymbols: true,
        temporaryPasswordValidityDays: 7,
      }
      // Forgot-password codes go out through our SES identity rather than
      // Cognito's shared sender, which caps a pool at about 50 emails a day.
      args.emailConfiguration = {
        emailSendingAccount: 'DEVELOPER',
        sourceArn: sesIdentityArn,
        fromEmailAddress: EMAIL_FROM,
        ...(EMAIL_REPLY_TO ? { replyToEmailAddress: EMAIL_REPLY_TO } : {}),
      }
      // The forgot-password email. Cognito sends it from its own
      // ForgotPassword flow using this template; the API sends every other
      // code itself (services/verification), so nothing else uses it.
      // `{####}` is where Cognito puts the code.
      args.verificationMessageTemplate = {
        defaultEmailOption: 'CONFIRM_WITH_CODE',
        emailSubject: 'Reset your InfernoLog password',
        emailMessage:
          'Use this code to reset your InfernoLog password:<br><br><b style="font-size:22px;letter-spacing:4px">{####}</b><br><br>It expires in 1 hour. If you didn\'t ask to reset your password, you can ignore this email — your password hasn\'t changed.',
      }
      // Cognito checks it may send as the identity when the configuration is
      // applied, so the authorization has to land first.
      opts.dependsOn = [cognitoSesPolicy]
    },
  },
  // No Lambda triggers, deliberately. The pool used to run a post-authentication
  // trigger that attached a signing-in Cognito user to whichever InfernoLog
  // account had the same email. Once an account can have several sign-in
  // providers, that is an account takeover: register the victim's address with
  // any provider that doesn't verify email, sign in, and inherit the account.
  // Identities are attached only by flows that know which account they are
  // acting for (signup, and linking under the account's own session) — never
  // by matching an email.
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
    // Carried into the Cognito user so its ID token has `email_verified`.
    // POST /v1/auth/signup/start refuses a token without it (G1 in the
    // password-auth design), so without this mapping every Google signup
    // would be rejected.
    email_verified: 'email_verified',
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
    // Every URL here is a place Cognito will hand an authorization code to.
    // The localhost entries exist so `pnpm dev` can run the real OAuth flow,
    // and they are deliberately absent on production: this is a public client
    // (no secret), so a callback URL the pool accepts is a callback URL an
    // attacker can name in a hand-built /authorize link. PKCE stops them
    // spending a code they cannot see, but anything listening on the victim's
    // localhost:5173 — another dev server, a random local tool — can see it.
    // Production has no reason to accept a loopback redirect, so it doesn't.
    callbackUrls: [
      'https://infernolog.com/auth/callback',
      ...($app.stage !== 'production'
        ? ['http://localhost:5173/auth/callback']
        : []),
      ...($app.stage !== 'production' && $app.stage !== 'alextripp'
        ? [`https://d1r4gy6uhfg2w9.cloudfront.net/auth/callback`]
        : []),
    ],
    // /signup is where a Google signup lands after being refused because its
    // email already belongs to another account (pages/AuthCallback.tsx).
    logoutUrls: [
      'https://infernolog.com',
      'https://infernolog.com/no-account-found',
      'https://infernolog.com/signup',
      ...($app.stage !== 'production'
        ? [
            'http://localhost:5173',
            'http://localhost:5173/no-account-found',
            'http://localhost:5173/signup',
          ]
        : []),
      ...($app.stage !== 'production' && $app.stage !== 'alextripp'
        ? [
            `https://d1r4gy6uhfg2w9.cloudfront.net`,
            `https://d1r4gy6uhfg2w9.cloudfront.net/no-account-found`,
            `https://d1r4gy6uhfg2w9.cloudfront.net/signup`,
          ]
        : []),
    ],
    // Only used when a request omits redirect_uri entirely. It must be a URL
    // that is also in callbackUrls above, so it follows the same stage split.
    defaultRedirectUri:
      $app.stage === 'production'
        ? 'https://infernolog.com/auth/callback'
        : 'http://localhost:5173/auth/callback',
    supportedIdentityProviders: ['Google', 'COGNITO'],
    // SRP is how the browser signs in with an email and password: the password
    // itself never leaves the page, only a proof of it. This client must never
    // get USER_PASSWORD_AUTH or ADMIN_USER_PASSWORD_AUTH, which send the
    // plaintext — the first to Cognito from the browser, the second only from
    // a server holding AWS credentials (InfernoLogServerClient below).
    explicitAuthFlows: ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
    // Sign-in, forgot-password and every other Cognito API answer the same
    // way whether or not an address has an account, so none of them can be
    // used to find out which addresses are registered.
    preventUserExistenceErrors: 'ENABLED',
  },
  { dependsOn: [googleProvider] }
)

// ─────────────────────────────────────────────
// SERVER APP CLIENT — every stage
//
// Used only by the API, to check a user's current password with
// AdminInitiateAuth before changing it or their email (PUT /v1/me/password,
// POST /v1/me/email/start). ADMIN_USER_PASSWORD_AUTH needs AWS credentials to
// call, so only a Lambda with the IAM permission can use it; the browser never
// can.
//
// It is NOT in the API Gateway authorizer's audience (infra/api.ts): the
// tokens a password check returns are discarded, and one presented to the API
// would be refused. Their lifetimes are set to Cognito's minimums anyway.
// ─────────────────────────────────────────────
export const serverClient = new aws.cognito.UserPoolClient(
  'InfernoLogServerClient',
  {
    name: 'InfernoLogServerClient',
    userPoolId: userPool.id,
    generateSecret: false,
    allowedOauthFlowsUserPoolClient: false,
    supportedIdentityProviders: ['COGNITO'],
    explicitAuthFlows: [
      'ALLOW_ADMIN_USER_PASSWORD_AUTH',
      'ALLOW_REFRESH_TOKEN_AUTH',
    ],
    preventUserExistenceErrors: 'ENABLED',
    accessTokenValidity: 5,
    idTokenValidity: 5,
    refreshTokenValidity: 60,
    tokenValidityUnits: {
      accessToken: 'minutes',
      idToken: 'minutes',
      refreshToken: 'minutes',
    },
  }
)

// ─────────────────────────────────────────────
// E2E APP CLIENT — non-production stages only
//
// The Playwright suite (apps/web/e2e/) needs a Cognito session without
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
