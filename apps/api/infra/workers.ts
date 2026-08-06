/// <reference path="../.sst/platform/config.d.ts" />

import { sharedEnvironment, sharedLinks } from './api'
import { sharedNodeOptions } from './defaults'
import { gddlKmsKey } from './kms'
import { levelSeedQueue } from './queue'

// Worker Lambda — runs the full GDDL import in the background so that
// API Gateway's hard 29-second integration timeout never applies.
// The route Lambda invokes this asynchronously (InvocationType: Event)
// and returns 202 + jobId immediately.
export const gddlSyncWorker = new sst.aws.Function('GddlSyncWorker', {
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

// Worker Lambda — processes an import job's rows in the background so
// API Gateway's hard 29-second integration timeout never applies. It
// reuses the level-seed queue (stub levels it creates get the same async
// RobTop enrichment as the old synchronous commit path) and, near its own
// time limit, asynchronously invokes itself again with the same jobId —
// hence the self-invoke permission granted below, added after creation
// since a resource can't reference its own ARN within its own definition.
export const importWorker = new sst.aws.Function('ImportWorker', {
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
