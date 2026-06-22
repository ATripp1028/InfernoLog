/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: 'infernolog',
      removal: input?.stage === 'production' ? 'retain' : 'remove',
      home: 'aws',
      providers: {
        aws: {
          region: 'us-east-1',
        },
      },
    }
  },
  async run() {
    // ─────────────────────────────────────────────
    // SECRETS
    // ─────────────────────────────────────────────
    const DATABASE_URL = new sst.Secret('DATABASE_URL')
    const DATABASE_URL_DIRECT = new sst.Secret('DATABASE_URL_DIRECT')
    const SENTRY_DSN = new sst.Secret('SENTRY_DSN')
    const GOOGLE_CLIENT_ID = new sst.Secret('GOOGLE_CLIENT_ID')
    const GOOGLE_CLIENT_SECRET = new sst.Secret('GOOGLE_CLIENT_SECRET')
    const DISCORD_CLIENT_ID = new sst.Secret('DISCORD_CLIENT_ID')
    const DISCORD_CLIENT_SECRET = new sst.Secret('DISCORD_CLIENT_SECRET')

    // ─────────────────────────────────────────────
    // KMS — encrypts user GDDL API keys at rest. Only the gddl-key routes are
    // granted Encrypt/Decrypt on this key (see below); no other Lambda can
    // read a stored key.
    // ─────────────────────────────────────────────
    const gddlKmsKey = new aws.kms.Key('GddlApiKeyKey', {
      description: `InfernoLog ${$app.stage} — encrypts user GDDL API keys`,
      enableKeyRotation: true,
    })

    new aws.kms.Alias('GddlApiKeyKeyAlias', {
      name: `alias/infernolog-${$app.stage}-gddl-api-key`,
      targetKeyId: gddlKmsKey.keyId,
    })

    // Shared options for all Lambda functions
    const sharedNodeOptions = {
      nodejs: {
        install: ['@sentry/aws-serverless'],
      },
      copyFiles: [
        {
          from: 'node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node',
          to: 'node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node',
        },
      ],
    }

    // ─────────────────────────────────────────────
    // AUTH — Cognito User Pool
    // ─────────────────────────────────────────────
    const userPool = new sst.aws.CognitoUserPool('InfernoLogUserPool', {
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

    const userPoolClient = new aws.cognito.UserPoolClient(
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
          ...($app.stage !== 'production' && $app.stage !== 'alextripp'
            ? [`https://d1r4gy6uhfg2w9.cloudfront.net`]
            : []),
        ],
        defaultRedirectUri: 'http://localhost:5173/auth/callback',
        supportedIdentityProviders: ['Google', 'COGNITO'],
        explicitAuthFlows: ['ALLOW_REFRESH_TOKEN_AUTH'],
      },
      { dependsOn: [googleProvider] }
    )

    // ─────────────────────────────────────────────
    // API — API Gateway + Lambda
    // ─────────────────────────────────────────────
    const api = new sst.aws.ApiGatewayV2('InfernoLogApi', {
      cors: {
        allowOrigins:
          $app.stage === 'production'
            ? ['https://infernolog.com']
            : ['http://localhost:5173'],
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
        allowCredentials: true,
      },
      domain:
        $app.stage === 'production'
          ? {
              name: 'api.infernolog.com',
              dns: sst.aws.dns(),
            }
          : undefined,
    })

    // ─────────────────────────────────────────────
    // API Gateway JWT authorizer — validates Cognito-issued tokens
    // before invoking the Lambda. Routes that opt in via `auth: { jwt: ... }`
    // get verified claims at event.requestContext.authorizer.jwt.claims.
    // ─────────────────────────────────────────────
    const jwtAuthorizer = api.addAuthorizer({
      name: 'CognitoJwt',
      jwt: {
        issuer: $interpolate`https://cognito-idp.us-east-1.amazonaws.com/${userPool.id}`,
        audiences: [userPoolClient.id],
      },
    })

    const jwtAuth = { jwt: { authorizer: jwtAuthorizer.id } }

    // Shared environment for all API Lambda functions
    const sharedEnvironment = {
      DATABASE_URL: DATABASE_URL.value,
      DATABASE_URL_DIRECT: DATABASE_URL_DIRECT.value,
      COGNITO_USER_POOL_ID: userPool.id,
      COGNITO_CLIENT_ID: userPoolClient.id,
      SENTRY_DSN: SENTRY_DSN.value,
      NODE_OPTIONS: '--import @sentry/aws-serverless/awslambda-auto',
    }

    // Shared links for all API Lambda functions
    const sharedLinks = [
      DATABASE_URL,
      DATABASE_URL_DIRECT,
      SENTRY_DSN,
      userPool,
      userPoolClient,
    ]

    api.route('GET /health', {
      handler: 'src/index.handler',
      link: sharedLinks,
      environment: sharedEnvironment,
      ...sharedNodeOptions,
    })

    api.route(
      'GET /v1/me',
      {
        handler: 'src/index.handler',
        link: sharedLinks,
        environment: sharedEnvironment,
        ...sharedNodeOptions,
      },
      { auth: jwtAuth }
    )

    api.route(
      'POST /v1/me/onboarding',
      {
        handler: 'src/index.handler',
        link: sharedLinks,
        environment: sharedEnvironment,
        ...sharedNodeOptions,
      },
      { auth: jwtAuth }
    )

    api.route('GET /v1/users/check-username', {
      handler: 'src/index.handler',
      link: sharedLinks,
      environment: sharedEnvironment,
      ...sharedNodeOptions,
    })

    // Env vars used by the connect-Discord initiator + public callback.
    // The signed `state` parameter ties the two together — no Cognito JWT
    // is needed on the public callback because the userId is encoded in
    // (and verified from) the state.
    const discordEnvironment = {
      ...sharedEnvironment,
      DISCORD_CLIENT_ID: DISCORD_CLIENT_ID.value,
      DISCORD_CLIENT_SECRET: DISCORD_CLIENT_SECRET.value,
      DISCORD_REDIRECT_URI:
        $app.stage === 'production'
          ? 'https://api.infernolog.com/auth/discord/callback'
          : 'https://6jeoegiga7.execute-api.us-east-1.amazonaws.com/auth/discord/callback',
      FRONTEND_URL:
        $app.stage === 'production'
          ? 'https://infernolog.com'
          : 'http://localhost:5173',
    }

    api.route(
      'POST /v1/me/connect-discord',
      {
        handler: 'src/index.handler',
        link: sharedLinks,
        environment: discordEnvironment,
        ...sharedNodeOptions,
      },
      { auth: jwtAuth }
    )

    api.route(
      'DELETE /v1/me/connect-discord',
      {
        handler: 'src/index.handler',
        link: sharedLinks,
        environment: sharedEnvironment,
        ...sharedNodeOptions,
      },
      { auth: jwtAuth }
    )

    api.route('GET /auth/discord/callback', {
      handler: 'src/index.handler',
      link: sharedLinks,
      environment: discordEnvironment,
      ...sharedNodeOptions,
    })

    // ─────────────────────────────────────────────
    // SETTINGS routes (PATCH preferences + rating categories CRUD)
    // ─────────────────────────────────────────────
    const authedRoute = (route: string) =>
      api.route(
        route,
        {
          handler: 'src/index.handler',
          link: sharedLinks,
          environment: sharedEnvironment,
          ...sharedNodeOptions,
        },
        { auth: jwtAuth }
      )

    authedRoute('PATCH /v1/me')
    authedRoute('PATCH /v1/me/username')
    authedRoute('PUT /v1/me/rating-config')
    authedRoute('GET /v1/me/rating-categories')

    // The "My Demons" list page — the user's full level-progress list.
    authedRoute('GET /v1/me/progress')

    // ─────────────────────────────────────────────
    // LOGGING — entry-creation writes + level-entry support
    // ─────────────────────────────────────────────
    // Progress and drop writes, plus the level-support endpoints.
    authedRoute('POST /v1/me/progress')
    authedRoute('POST /v1/me/drops')
    authedRoute('GET /v1/levels/search')
    // API Gateway HTTP API path params use {brace} syntax; Hono's own routes
    // keep :levelId. The actual request path is forwarded to Hono unchanged.
    authedRoute('GET /v1/levels/{levelId}/resolve')
    authedRoute('POST /v1/levels')
    authedRoute('GET /v1/levels/{levelId}')

    // GDDL API key routes — these Lambdas additionally get the KMS key id in
    // their environment and IAM permission to Encrypt/Decrypt with it. Scoped
    // here (not in sharedEnvironment) so no other route can touch the key.
    const gddlKeyEnvironment = {
      ...sharedEnvironment,
      GDDL_KMS_KEY_ID: gddlKmsKey.arn,
    }
    const gddlKeyPermissions = [
      {
        actions: ['kms:Encrypt', 'kms:Decrypt'],
        resources: [gddlKmsKey.arn],
      },
    ]
    const gddlKeyRoute = (route: string) =>
      api.route(
        route,
        {
          handler: 'src/index.handler',
          link: sharedLinks,
          environment: gddlKeyEnvironment,
          permissions: gddlKeyPermissions,
          ...sharedNodeOptions,
        },
        { auth: jwtAuth }
      )

    gddlKeyRoute('PUT /v1/me/gddl-key')
    gddlKeyRoute('DELETE /v1/me/gddl-key')

    // Completion writes get KMS access too: a completion may optionally submit
    // a GDDL record, which requires decrypting the user's stored GDDL key.
    gddlKeyRoute('POST /v1/me/completions')

    // ─────────────────────────────────────────────
    // SSM OUTPUTS — read by apps/web/sst.config.ts
    // ─────────────────────────────────────────────
    new aws.ssm.Parameter('SsmApiUrl', {
      name: `/infernolog/${$app.stage}/api-url`,
      type: 'String',
      value: api.url,
    })

    new aws.ssm.Parameter('SsmUserPoolId', {
      name: `/infernolog/${$app.stage}/user-pool-id`,
      type: 'String',
      value: userPool.id,
    })

    new aws.ssm.Parameter('SsmUserPoolClientId', {
      name: `/infernolog/${$app.stage}/user-pool-client-id`,
      type: 'String',
      value: userPoolClient.id,
    })

    new aws.ssm.Parameter('SsmCognitoDomain', {
      name: `/infernolog/${$app.stage}/cognito-domain`,
      type: 'String',
      value:
        $app.stage === 'production'
          ? 'infernolog.auth.us-east-1.amazoncognito.com'
          : `infernolog-${$app.stage}.auth.us-east-1.amazoncognito.com`,
    })

    // ─────────────────────────────────────────────
    // OUTPUTS
    // ─────────────────────────────────────────────
    return {
      api: api.url,
      userPoolId: userPool.id,
      userPoolClientId: userPoolClient.id,
    }
  },
})
