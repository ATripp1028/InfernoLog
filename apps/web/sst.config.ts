/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: 'infernolog-web',
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

    // ─────────────────────────────────────────────
    // SECURITY HEADERS
    //
    // CloudFront serves the SPA with no headers of its own by default, which
    // leaves the app framable (every destructive action here — delete account,
    // disconnect Discord — is one click behind a dialog, so clickjacking is a
    // real path to them) and leaves XSS entirely uncontained. Containment
    // matters more than usual: Amplify keeps the Cognito id/refresh tokens in
    // localStorage, so any script execution in this origin is a full account
    // takeover, not a defacement.
    //
    // The CSP is an allowlist of the hosts the app actually talks to. Adding a
    // new external image host, embed, or API means adding it here too — the
    // failure mode is a silently blocked request in the browser console, so
    // check there first when something external stops loading.
    //
    // 'unsafe-inline' is present for styles only, never scripts: Radix,
    // framer-motion and sonner all set inline `style` attributes, and inline
    // CSS is not an execution sink. The built index.html carries no inline
    // <script>, so script-src stays at 'self'.
    // ─────────────────────────────────────────────
    const stripSlash = (url: string) => url.replace(/\/+$/, '')

    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      // Google Fonts is pulled in by an @import in styles/tokens.css, which
      // stays an @import in the bundled CSS — hence the stylesheet host here
      // and the font host in font-src.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      // levelthumbs: level thumbnails. img.youtube.com: video posters.
      // gdladder.com: the GDDL favicon on the API-key settings row.
      "img-src 'self' data: blob: https://levelthumbs.prevter.me https://img.youtube.com https://gdladder.com",
      `connect-src 'self' ${stripSlash(apiUrl.value)} https://cognito-idp.us-east-1.amazonaws.com https://${cognitoDomain.value}`,
      // Completion video embeds (HeroVideo). Both srcs are rebuilt from an
      // extracted id, never from the user's URL verbatim.
      'frame-src https://www.youtube.com https://clips.twitch.tv',
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      // Nothing in this app is meant to be framed, embedded, or to post a
      // form off-origin.
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'none'",
      "object-src 'none'",
      'upgrade-insecure-requests',
    ].join('; ')

    const responseHeaders = new aws.cloudfront.ResponseHeadersPolicy(
      'InfernoLogWebHeaders',
      {
        name: `infernolog-web-security-headers-${$app.stage}`,
        securityHeadersConfig: {
          contentSecurityPolicy: {
            contentSecurityPolicy: csp,
            override: true,
          },
          contentTypeOptions: { override: true },
          frameOptions: { frameOption: 'DENY', override: true },
          referrerPolicy: {
            referrerPolicy: 'strict-origin-when-cross-origin',
            override: true,
          },
          // Two years with preload, matching the HSTS preload list's
          // requirements. Only meaningful on the custom domain — the
          // CloudFront default domain is already HTTPS-only.
          strictTransportSecurity: {
            accessControlMaxAgeSec: 63072000,
            includeSubdomains: true,
            preload: true,
            override: true,
          },
        },
        customHeadersConfig: {
          items: [
            {
              header: 'Permissions-Policy',
              value:
                'accelerometer=(self), camera=(), display-capture=(), geolocation=(), gyroscope=(self), microphone=(), payment=(), usb=()',
              override: true,
            },
            // Referrer-Policy above is the enforced one; this pairs with it to
            // keep the app out of other origins' process-level side channels.
            {
              header: 'Cross-Origin-Opener-Policy',
              value: 'same-origin-allow-popups',
              override: true,
            },
          ],
        },
      }
    )

    const web = new sst.aws.StaticSite('InfernoLogWeb', {
      path: '.',
      build: {
        command: 'pnpm build',
        output: 'dist',
      },
      domain:
        $app.stage === 'production'
          ? {
              name: 'infernolog.com',
              dns: sst.aws.dns(),
            }
          : undefined,
      environment: {
        VITE_API_URL: apiUrl.value,
        VITE_COGNITO_USER_POOL_ID: userPoolId.value,
        VITE_COGNITO_CLIENT_ID: userPoolClientId.value,
        VITE_COGNITO_DOMAIN: cognitoDomain.value,
        VITE_REDIRECT_SIGN_IN:
          $app.stage === 'production'
            ? 'https://infernolog.com/auth/callback'
            : 'http://localhost:5173/auth/callback',
        VITE_REDIRECT_SIGN_OUT:
          $app.stage === 'production'
            ? 'https://infernolog.com'
            : 'http://localhost:5173',
      },
      transform: {
        cdn: (args) => {
          args.defaultCacheBehavior = $output(args.defaultCacheBehavior).apply(
            (behavior) => ({
              ...behavior,
              responseHeadersPolicyId: responseHeaders.id,
            })
          )
        },
      },
    })

    return {
      web: web.url,
    }
  },
})
