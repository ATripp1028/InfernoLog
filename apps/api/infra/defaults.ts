/// <reference path="../.sst/platform/config.d.ts" />

// Shared options for all Lambda functions. copyFiles ships the Prisma query
// engine binary into the bundle — Prisma will not work without it.
export const sharedNodeOptions = {
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
