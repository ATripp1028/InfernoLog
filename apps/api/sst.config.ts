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
      memory: '1024 MB' as const,
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

    api.route('GET /v1/users/check-username', {
      handler: 'src/index.handler',
      link: sharedLinks,
      environment: sharedEnvironment,
      ...sharedNodeOptions,
    })

    // Claims-only routes: need a verified Cognito identity but not an
    // existing User row (createUserForSignup hasn't run yet, or never will
    // for a rejected sign-in). Both still require the JWT authorizer — only
    // the Prisma "does a user row exist" check is skipped.
    api.route(
      'POST /v1/auth/signup/start',
      {
        handler: 'src/index.handler',
        link: sharedLinks,
        environment: sharedEnvironment,
        ...sharedNodeOptions,
      },
      { auth: jwtAuth }
    )

    api.route(
      'POST /v1/auth/signin/reject',
      {
        handler: 'src/index.handler',
        link: sharedLinks,
        environment: sharedEnvironment,
        permissions: [
          {
            actions: ['cognito-idp:AdminDeleteUser'],
            resources: [userPool.arn],
          },
        ],
        ...sharedNodeOptions,
      },
      { auth: jwtAuth }
    )

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

    // Needs cognito-idp:AdminDeleteUser (like signin/reject above) to remove
    // the Cognito identity alongside the InfernoLog account, so authedRoute's
    // permission-less shape doesn't fit here.
    api.route(
      'DELETE /v1/me',
      {
        handler: 'src/index.handler',
        link: sharedLinks,
        environment: sharedEnvironment,
        permissions: [
          {
            actions: ['cognito-idp:AdminDeleteUser'],
            resources: [userPool.arn],
          },
        ],
        ...sharedNodeOptions,
      },
      { auth: jwtAuth }
    )

    // The List page — the user's full level-progress list.
    authedRoute('GET /v1/me/progress')
    // Edit the most recent progress update + level metadata for an entry.
    authedRoute('PATCH /v1/me/progress/{levelId}')
    // Delete an entire level entry from the list.
    authedRoute('DELETE /v1/me/progress/{levelId}')
    // Delete a single logged entry (completion/progress/drop) for a level.
    authedRoute('DELETE /v1/me/progress/{levelId}/updates/{progressUpdateId}')
    // Level Page — the per-user view of a single level's full history.
    authedRoute('GET /v1/me/progress/{levelId}')

    // ─────────────────────────────────────────────
    // CLASSIC RANKING — the personal difficulty-ordering page.
    // ─────────────────────────────────────────────
    // Placed + unplaced columns in one payload; place / reorder / unplace.
    authedRoute('GET /v1/me/ranking/classic')
    authedRoute('POST /v1/me/ranking/classic')
    authedRoute('PATCH /v1/me/ranking/classic/{levelProgressId}')
    authedRoute('DELETE /v1/me/ranking/classic/{levelProgressId}')

    // ─────────────────────────────────────────────
    // LOGGING — entry-creation writes + level-entry support
    // ─────────────────────────────────────────────
    // Progress and drop writes, plus the level-support endpoints.
    authedRoute('POST /v1/me/progress')
    authedRoute('POST /v1/me/drops')
    authedRoute('GET /v1/levels/search')
    // The /search page's cursor-paginated, filtered cache search. Cache-only
    // (no RobTop), so the default timeout is fine.
    authedRoute('GET /v1/levels/browse')
    // The GD-server search escalation hits RobTop and shares the same global
    // rate limiter as /resolve, so it gets the same extended timeout rather
    // than authedRoute's default.
    api.route(
      'GET /v1/levels/gd-search',
      {
        handler: 'src/index.handler',
        link: sharedLinks,
        environment: sharedEnvironment,
        timeout: '25 seconds',
        ...sharedNodeOptions,
      },
      { auth: jwtAuth }
    )
    // API Gateway HTTP API path params use {brace} syntax; Hono's own routes
    // keep :levelId. The actual request path is forwarded to Hono unchanged.
    // Explicit timeout (rather than authedRoute's default) because this route
    // shares the global RobTop rate limiter (robtopRateLimit.ts) with the
    // level-seed worker's import-enrichment bursts — a request landing during
    // one of those bursts can wait longer for a free slot than the default
    // budget comfortably covers.
    api.route(
      'GET /v1/levels/{levelId}/resolve',
      {
        handler: 'src/index.handler',
        link: sharedLinks,
        environment: sharedEnvironment,
        timeout: '25 seconds',
        ...sharedNodeOptions,
      },
      { auth: jwtAuth }
    )
    // The Global Level Page's data source. Like /resolve it can hit RobTop (on a
    // cache miss) and shares the same global rate limiter, so it gets the same
    // extended timeout rather than authedRoute's default.
    api.route(
      'GET /v1/levels/{levelId}/page',
      {
        handler: 'src/index.handler',
        link: sharedLinks,
        environment: sharedEnvironment,
        timeout: '25 seconds',
        ...sharedNodeOptions,
      },
      { auth: jwtAuth }
    )
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

    // Manual GDDL record submission from the level page (retry path).
    gddlKeyRoute('POST /v1/me/gddl-records/{levelId}')

    // Bidirectional favorites/least-favorites list sync — needs KMS decrypt to
    // read the stored GDDL API key. Synchronous (lists are small, max 4 items).
    gddlKeyRoute('POST /v1/me/gddl-lists-sync')

    // Level-seed SQS queue — declared here (ahead of the SPREADSHEET IMPORT
    // section below, which owns the consumer side) so gddlSyncWorker can link
    // to it too: a GDDL sync can find existing-but-unverified stub levels
    // (see getOrCreateLevel's needsSeed in services/gddlSync.ts) and needs to
    // enqueue them for the same async RobTop enrichment as spreadsheet import.
    const levelSeedDlq = new sst.aws.Queue('LevelSeedDlq')

    const levelSeedQueue = new sst.aws.Queue('LevelSeedQueue', {
      dlq: {
        queue: levelSeedDlq.arn,
        retry: 3,
      },
    })

    // Worker Lambda — runs the full GDDL import in the background so that
    // API Gateway's hard 29-second integration timeout never applies.
    // The route Lambda invokes this asynchronously (InvocationType: Event)
    // and returns 202 + jobId immediately.
    const gddlSyncWorker = new sst.aws.Function('GddlSyncWorker', {
      handler: 'src/handlers/gddlSyncWorker.handler',
      link: [...sharedLinks, levelSeedQueue],
      environment: {
        ...sharedEnvironment,
        GDDL_KMS_KEY_ID: gddlKmsKey.arn,
        LEVEL_SEED_QUEUE_URL: levelSeedQueue.url,
      },
      permissions: [
        {
          actions: ['kms:Decrypt'],
          resources: [gddlKmsKey.arn],
        },
        {
          actions: ['sqs:SendMessage'],
          resources: [levelSeedQueue.arn],
        },
      ],
      timeout: '15 minutes',
      ...sharedNodeOptions,
    })

    // POST /v1/me/gddl-sync — creates the job row, invokes the worker async,
    // returns 202 + jobId. No KMS access needed here: the check is whether the
    // encrypted key field is non-null; decryption is done by the worker.
    api.route(
      'POST /v1/me/gddl-sync',
      {
        handler: 'src/index.handler',
        link: sharedLinks,
        environment: {
          ...sharedEnvironment,
          GDDL_SYNC_WORKER_ARN: gddlSyncWorker.arn,
        },
        permissions: [
          {
            actions: ['lambda:InvokeFunction'],
            resources: [gddlSyncWorker.arn],
          },
        ],
        ...sharedNodeOptions,
      },
      { auth: jwtAuth }
    )

    // GET /v1/me/gddl-sync — the user's current/most-recent sync job status
    // (no jobId path param — mirrors GET /v1/me/import/status).
    authedRoute('GET /v1/me/gddl-sync')

    // POST /v1/me/gddl-sync/ack — marks a completed/failed job acknowledged
    // so GET stops returning it once the client has shown the result.
    authedRoute('POST /v1/me/gddl-sync/ack')

    // ─────────────────────────────────────────────
    // COLLECTIONS — built-in (Want to Beat / Favorites / Least Favorites)
    // and custom user collections of levels.
    // ─────────────────────────────────────────────
    authedRoute('GET /v1/me/collections')
    authedRoute('POST /v1/me/collections')
    authedRoute('GET /v1/me/collections/{collectionId}')
    authedRoute('PATCH /v1/me/collections/{collectionId}')
    authedRoute('DELETE /v1/me/collections/{collectionId}')
    authedRoute('POST /v1/me/collections/{collectionId}/entries')
    authedRoute('PATCH /v1/me/collections/{collectionId}/entries/{entryId}')
    authedRoute('DELETE /v1/me/collections/{collectionId}/entries/{entryId}')

    // ─────────────────────────────────────────────
    // LIST PRESETS — saved view configurations for the List page.
    // ─────────────────────────────────────────────
    authedRoute('GET /v1/me/list-presets')
    authedRoute('POST /v1/me/list-presets')
    authedRoute('PATCH /v1/me/list-presets/{id}')
    authedRoute('DELETE /v1/me/list-presets/{id}')

    // ─────────────────────────────────────────────
    // SPREADSHEET IMPORT — level-seed SQS queue + consumer.
    //
    // The import endpoint commits stub levels immediately and enqueues their
    // IDs for async metadata enrichment via RobTop. The system-wide rate
    // limit is now enforced by the shared Postgres-backed token bucket
    // (utils/robtopRateLimit.ts) rather than by serializing this consumer —
    // that limiter is explicitly safe under concurrent callers (an atomic
    // row UPDATE), so a modest concurrency here just lets more batches make
    // progress in parallel while still bottlenecked by the same shared
    // ceiling. Each batch can carry up to 8 level IDs (BATCH_SIZE in
    // services/import.ts), each needing up to ~49s in the worst case (3
    // retries, each up to a 10s rate-limiter wait + 5s fetch, plus backoff)
    // — timeout sized well above that per-batch worst case.
    // ─────────────────────────────────────────────
    levelSeedQueue.subscribe(
      {
        handler: 'src/handlers/levelSeedWorker.handler',
        link: sharedLinks,
        environment: sharedEnvironment,
        ...sharedNodeOptions,
        timeout: '10 minutes',
        concurrency: 5,
      },
      { batch: { size: 1 } }
    )

    // POST /v1/me/import/start persists the dataset and returns immediately —
    // no SQS access needed here, the level-seed enqueue happens inside the
    // worker. /check and /export are plain synchronous reads/pre-flight.
    api.route(
      'POST /v1/me/import/check',
      {
        handler: 'src/index.handler',
        link: sharedLinks,
        environment: sharedEnvironment,
        // checkImportConflicts does several DB-heavy sub-checks (ratings,
        // collections merge, ranking merge, progress/dropped dedup scans)
        // plus a name-resolution fallback to RobTop for collections entries
        // — bumped to match /me/export's timeout rather than relying on the
        // default, which fit the route's original single-query shape but not
        // this one.
        timeout: '28 seconds',
        ...sharedNodeOptions,
      },
      { auth: jwtAuth }
    )

    authedRoute('PATCH /v1/me/import/rows/{rowId}/resolve')
    authedRoute('POST /v1/me/import/resolve-all')
    authedRoute('GET /v1/me/import/status')

    api.route(
      'GET /v1/me/export',
      {
        handler: 'src/index.handler',
        link: sharedLinks,
        environment: sharedEnvironment,
        timeout: '28 seconds',
        ...sharedNodeOptions,
      },
      { auth: jwtAuth }
    )

    // Worker Lambda — processes an import job's rows in the background so
    // API Gateway's hard 29-second integration timeout never applies. It
    // reuses the level-seed queue (stub levels it creates get the same async
    // RobTop enrichment as the old synchronous commit path) and, near its own
    // time limit, asynchronously invokes itself again with the same jobId —
    // hence the self-invoke permission granted below, added after creation
    // since a resource can't reference its own ARN within its own definition.
    const importWorker = new sst.aws.Function('ImportWorker', {
      handler: 'src/handlers/importWorker.handler',
      link: [...sharedLinks, levelSeedQueue],
      environment: {
        ...sharedEnvironment,
        LEVEL_SEED_QUEUE_URL: levelSeedQueue.url,
      },
      permissions: [
        {
          actions: ['sqs:SendMessage'],
          resources: [levelSeedQueue.arn],
        },
      ],
      timeout: '15 minutes',
      ...sharedNodeOptions,
    })

    new aws.iam.RolePolicy('ImportWorkerSelfInvoke', {
      role: importWorker.nodes.role.name,
      policy: importWorker.arn.apply((arn) =>
        JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            { Effect: 'Allow', Action: 'lambda:InvokeFunction', Resource: arn },
          ],
        })
      ),
    })

    // POST /v1/me/import/start — creates the job + rows, invokes the worker
    // async, returns 202 + jobId.
    api.route(
      'POST /v1/me/import/start',
      {
        handler: 'src/index.handler',
        link: sharedLinks,
        environment: {
          ...sharedEnvironment,
          IMPORT_WORKER_ARN: importWorker.arn,
        },
        permissions: [
          {
            actions: ['lambda:InvokeFunction'],
            resources: [importWorker.arn],
          },
        ],
        ...sharedNodeOptions,
      },
      { auth: jwtAuth }
    )

    // ─────────────────────────────────────────────
    // ROBTOP LEVEL-CACHE SYNC — a single frequent EventBridge Scheduler cron
    // over the shared fetch/compare/write core (services/levelSync.ts). Each run
    // processes one bounded round-robin slice of the level cache, advancing a
    // cursor and wrapping at the end, so every level is re-checked over a full
    // rotation without any single run being large enough to trip RobTop's rate
    // limit. Overwrites the `levels` cache directly on diff; no staging or nudge.
    //
    // 15-minute timeout comfortably covers one slice at ~670ms/level RobTop
    // pacing. See EXTERNAL_APIS.md.
    // ─────────────────────────────────────────────
    const syncFunctionOptions = {
      link: sharedLinks,
      environment: sharedEnvironment,
      timeout: '15 minutes' as const,
      ...sharedNodeOptions,
    }

    new sst.aws.CronV2('LevelSync', {
      // Every 6 hours. Each run processes one bounded round-robin slice
      // (SYNC_SLICE_SIZE levels) so no single run can trip RobTop's per-IP rate
      // limit, and the ~6h gap gives the egress IP plenty of recovery time.
      schedule: 'cron(0 0/6 * * ? *)',
      function: {
        handler: 'src/handlers/levelSyncWorker.handler',
        ...syncFunctionOptions,
      },
    })

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
