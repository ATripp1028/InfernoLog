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
          link: [DATABASE_URL, DATABASE_URL_DIRECT],
          environment: {
            DATABASE_URL: DATABASE_URL.value,
            DATABASE_URL_DIRECT: DATABASE_URL_DIRECT.value,
          },
        },
      },
    });

    // Add domain separately using the raw AWS provider
    new aws.cognito.UserPoolDomain("InfernoLogDomain", {
      domain: "infernolog",
      userPoolId: userPool.id,
    });

    const googleProvider = new aws.cognito.IdentityProvider(
      "GoogleProvider",
      {
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
      }
    );

    const userPoolClient = new aws.cognito.UserPoolClient("InfernoLogWebClient", {
      name: "InfernoLogWebClient",
      userPoolId: userPool.id,
      generateSecret: false,
      allowedOauthFlows: ["code"],
      allowedOauthFlowsUserPoolClient: true,
      allowedOauthScopes: ["email", "openid", "profile"],
      callbackUrls: [
        "http://localhost:5173/auth/callback",
        "https://infernolog.com/auth/callback",
      ],
      logoutUrls: [
        "http://localhost:5173",
        "https://infernolog.com",
      ],
      defaultRedirectUri: "http://localhost:5173/auth/callback",
      supportedIdentityProviders: ["Google", "COGNITO"],
      explicitAuthFlows: [
        "ALLOW_REFRESH_TOKEN_AUTH",
      ],
    }, { dependsOn: [googleProvider] });

    // ─────────────────────────────────────────────
    // API — API Gateway + Lambda
    // ─────────────────────────────────────────────
    const api = new sst.aws.ApiGatewayV2("InfernoLogApi", {
      domain:
        $app.stage === "production"
          ? {
              name: "api.infernolog.com",
              dns: sst.aws.dns(),
            }
          : undefined,
    });

    api.route("GET /health", {
      handler: "src/index.handler",
      link: [
        DATABASE_URL,
        DATABASE_URL_DIRECT,
        SENTRY_DSN,
        userPool,
        userPoolClient,
      ],
    });

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