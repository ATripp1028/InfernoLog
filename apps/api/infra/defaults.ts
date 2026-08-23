/// <reference path="../.sst/platform/config.d.ts" />

// Shared options for all Lambda functions. copyFiles ships the Prisma query
// engine binary into the bundle — Prisma will not work without it.
export const sharedNodeOptions = {
  memory: '1024 MB' as const,
  // Pinned rather than inherited. SST's default runtime moves with SST
  // upgrades (4.7.9 defaults to nodejs24.x), so leaving it unset means a
  // routine dependency bump can silently change the Node version — and with it
  // the bundled undici — under every Lambda, including the ones talking to
  // RobTop, where the request has to reach Cloudflare byte-for-byte. This is
  // the version production already runs; change it deliberately.
  runtime: 'nodejs24.x' as const,
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
