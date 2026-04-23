/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "infernolog",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          region: "us-east-1",
        },
      },
    };
  },
  async run() {
    // ─────────────────────────────────────────────
    // SECRETS
    // ─────────────────────────────────────────────
    const DATABASE_URL = new sst.Secret("DATABASE_URL");
    const DATABASE_URL_DIRECT = new sst.Secret("DATABASE_URL_DIRECT");
    const SENTRY_DSN = new sst.Secret("SENTRY_DSN");
    const GOOGLE_CLIENT_ID = new sst.Secret("GOOGLE_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = new sst.Secret("GOOGLE_CLIENT_SECRET");

    // ─────────────────────────────────────────────
    // AUTH — Cognito User Pool
    // ─────────────────────────────────────────────
    const userPool = new sst.aws.CognitoUserPool("InfernoLogUserPool", {
      usernames: ["email"],
      triggers: {
        postAuthentication: {
          handler: "src/triggers/postAuthentication.handler",
          link: [DATABASE_URL, DATABASE_URL_DIRECT, SENTRY_DSN],
          environment: {
            DATABASE_URL: DATABASE_URL.value,
            DATABASE_URL_DIRECT: DATABASE_URL_DIRECT.value,
            SENTRY_DSN: SENTRY_DSN.value,
          },
        },
      },
    });

    new aws.cognito.UserPoolDomain("InfernoLogDomain", {
      domain: $app.stage === "production" ? "infernolog" : `infernolog-${$app.stage}`,
      userPoolId: userPool.id,
    });

    const googleProvider = new aws.cognito.IdentityProvider("GoogleProvider", {
      userPoolId: userPool.id,
      providerName: "Google",
      providerType: "Google",
      providerDetails: {
        client_id: GOOGLE_CLIENT_ID.value,
        client_secret: GOOGLE_CLIENT_SECRET.value,
        authorize_scopes: "email openid profile",
      },
      attributeMapping: {
        email: "email",
        name: "name",
        username: "sub",
      },
    });

    const userPoolClient = new aws.cognito.UserPoolClient(
      "InfernoLogWebClient",
      {
        name: "InfernoLogWebClient",
        userPoolId: userPool.id,
        generateSecret: false,
        allowedOauthFlows: ["code"],
        allowedOauthFlowsUserPoolClient: true,
        allowedOauthScopes: ["email", "openid", "profile"],
        callbackUrls: [
          "http://localhost:5173/auth/callback",
          "https://infernolog.com/auth/callback",
          ...$app.stage !== "production" && $app.stage !== "alextripp"
            ? [`https://d1r4gy6uhfg2w9.cloudfront.net/auth/callback`]
            : [],
        ],
        logoutUrls: [
          "http://localhost:5173",
          "https://infernolog.com",
          ...$app.stage !== "production" && $app.stage !== "alextripp"
            ? [`https://d1r4gy6uhfg2w9.cloudfront.net`]
            : [],
        ],
        defaultRedirectUri: "http://localhost:5173/auth/callback",
        supportedIdentityProviders: ["Google", "COGNITO"],
        explicitAuthFlows: ["ALLOW_REFRESH_TOKEN_AUTH"],
      },
      { dependsOn: [googleProvider] }
    );

    // ─────────────────────────────────────────────
    // API — API Gateway + Lambda
    // ─────────────────────────────────────────────
    const api = new sst.aws.ApiGatewayV2("InfernoLogApi", {
      cors: {
        allowOrigins:
          $app.stage === "production"
            ? ["https://infernolog.com"]
            : ["http://localhost:5173", "*"],
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
      domain:
        $app.stage === "production"
          ? {
              name: "api.infernolog.com",
              dns: sst.aws.dns(),
            }
          : undefined,
    });

    // Shared environment for all API Lambda functions
    const sharedEnvironment = {
      DATABASE_URL: DATABASE_URL.value,
      DATABASE_URL_DIRECT: DATABASE_URL_DIRECT.value,
      COGNITO_USER_POOL_ID: userPool.id,
      COGNITO_CLIENT_ID: userPoolClient.id,
      SENTRY_DSN: SENTRY_DSN.value,
      NODE_OPTIONS: "--import @sentry/aws-serverless/awslambda-auto"
    };

    // Node.js options for Lambda functions that use Sentry
    const sharedNodeOptions = {
      nodejs: {
        install: ['@sentry/aws-serverless'],
      }
    };

    // Shared links for all API Lambda functions
    const sharedLinks = [
      DATABASE_URL,
      DATABASE_URL_DIRECT,
      SENTRY_DSN,
      userPool,
      userPoolClient,
    ];

    api.route("GET /health", {
      handler: "src/index.handler",
      link: sharedLinks,
      environment: sharedEnvironment,
      ...sharedNodeOptions,
    })

    api.route("GET /v1/me", {
      handler: "src/index.handler",
      link: sharedLinks,
      environment: sharedEnvironment,
      ...sharedNodeOptions,
    })

    api.route("POST /v1/me/onboarding", {
      handler: "src/index.handler",
      link: sharedLinks,
      environment: sharedEnvironment,
      ...sharedNodeOptions
    })

    api.route("GET /v1/users/check-username", {
      handler: "src/index.handler",
      link: sharedLinks,
      environment: sharedEnvironment,
      ...sharedNodeOptions,
    })

    // ─────────────────────────────────────────────
    // SSM OUTPUTS — read by apps/web/sst.config.ts
    // ─────────────────────────────────────────────
    new aws.ssm.Parameter("SsmApiUrl", {
      name: `/infernolog/${$app.stage}/api-url`,
      type: "String",
      value: api.url,
    })

    new aws.ssm.Parameter("SsmUserPoolId", {
      name: `/infernolog/${$app.stage}/user-pool-id`,
      type: "String",
      value: userPool.id,
    })

    new aws.ssm.Parameter("SsmUserPoolClientId", {
      name: `/infernolog/${$app.stage}/user-pool-client-id`,
      type: "String",
      value: userPoolClient.id,
    })

    new aws.ssm.Parameter("SsmCognitoDomain", {
      name: `/infernolog/${$app.stage}/cognito-domain`,
      type: "String",
      value: $app.stage === "production"
        ? "infernolog.auth.us-east-1.amazoncognito.com"
        : `infernolog-${$app.stage}.auth.us-east-1.amazoncognito.com`,
    })

    // ─────────────────────────────────────────────
    // OUTPUTS
    // ─────────────────────────────────────────────
    return {
      api: api.url,
      userPoolId: userPool.id,
      userPoolClientId: userPoolClient.id,
    };
  },
});