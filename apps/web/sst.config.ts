/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "infernolog-web",
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
    // Read backend outputs from SSM
    const apiUrl = await aws.ssm.getParameter({
      name: `/infernolog/${$app.stage}/api-url`,
    })

    const userPoolId = await aws.ssm.getParameter({
      name: `/infernolog/${$app.stage}/user-pool-id`,
    })

    const userPoolClientId = await aws.ssm.getParameter({
      name: `/infernolog/${$app.stage}/user-pool-client-id`,
    })

    const cognitoDomain = await aws.ssm.getParameter({
      name: `/infernolog/${$app.stage}/cognito-domain`,
    })

    const web = new sst.aws.StaticSite("InfernoLogWeb", {
      path: ".",
      build: {
        command: "pnpm build",
        output: "dist",
      },
      domain:
        $app.stage === "production"
          ? {
              name: "infernolog.com",
              dns: sst.aws.dns(),
            }
          : undefined,
      environment: {
        VITE_API_URL: apiUrl.value,
        VITE_COGNITO_USER_POOL_ID: userPoolId.value,
        VITE_COGNITO_CLIENT_ID: userPoolClientId.value,
        VITE_COGNITO_DOMAIN: cognitoDomain.value,
        VITE_REDIRECT_SIGN_IN:
          $app.stage === "production"
            ? "https://infernolog.com/auth/callback"
            : "http://localhost:5173/auth/callback",
        VITE_REDIRECT_SIGN_OUT:
          $app.stage === "production"
            ? "https://infernolog.com"
            : "http://localhost:5173",
      },
    })

    return {
      web: web.url,
    }
  },
})