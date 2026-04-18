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
    const DATABASE_URL = new sst.Secret("DATABASE_URL");
    const DATABASE_URL_DIRECT = new sst.Secret("DATABASE_URL_DIRECT");
    const COGNITO_USER_POOL_ID = new sst.Secret("COGNITO_USER_POOL_ID");
    const COGNITO_CLIENT_ID = new sst.Secret("COGNITO_CLIENT_ID");
    const SENTRY_DSN = new sst.Secret("SENTRY_DSN");

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
        COGNITO_USER_POOL_ID,
        COGNITO_CLIENT_ID,
        SENTRY_DSN,
      ],
    });

    return {
      api: api.url,
    };
  },
});