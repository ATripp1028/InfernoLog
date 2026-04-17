/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "api",
      removal: input?.stage === "production" ? "retain" : "remove",
      providers: {
        aws: {}
      }
    };
  },
  async run() {
    const DATABASE_URL = new sst.Secret("DATABASE_URL");
    const DATABASE_URL_DIRECT = new sst.Secret("DATABASE_URL_DIRECT");
    const COGNITO_USER_POOL_ID = new sst.Secret("COGNITO_USER_POOL_ID");
    const COGNITO_CLIENT_ID = new sst.Secret("COGNITO_CLIENT_ID");
    const SENTRY_DSN = new sst.Secret("SENTRY_DSN");

    const api = new sst.aws.ApiGatewayV2("api", {
      // Set the custom domain based on stage
      domain: $app.stage === "production" ? "api.infernolog.com" : undefined,
    });

    api.route("$default", {
      handler: "src/index.handler",
      link: [
        DATABASE_URL, 
        DATABASE_URL_DIRECT, 
        COGNITO_USER_POOL_ID, 
        COGNITO_CLIENT_ID, 
        SENTRY_DSN
      ],
      environment: {
        DATABASE_URL: DATABASE_URL.value,
        DATABASE_URL_DIRECT: DATABASE_URL_DIRECT.value,
        COGNITO_USER_POOL_ID: COGNITO_USER_POOL_ID.value,
        COGNITO_CLIENT_ID: COGNITO_CLIENT_ID.value,
        SENTRY_DSN: SENTRY_DSN.value,
      }
    });
  },
});