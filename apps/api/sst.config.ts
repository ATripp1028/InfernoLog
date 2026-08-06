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
    // Infrastructure lives in ./infra. These are dynamic imports because the
    // SST globals ($app, sst, aws, $interpolate) only exist once run() is
    // called — a top-level import of these modules would evaluate too early.
    // Each module creates its resources as a side effect of being imported;
    // the import graph (secrets/defaults → kms/auth → api → queue → workers →
    // routes) fixes the ordering, so the order of the awaits below only
    // matters for readability.
    await import('./infra/queue')
    await import('./infra/workers')
    await import('./infra/routes')
    await import('./infra/cron')

    const { outputs } = await import('./infra/outputs')
    return outputs
  },
})
