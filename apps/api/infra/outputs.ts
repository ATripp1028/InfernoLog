/// <reference path="../.sst/platform/config.d.ts" />

import { api } from './api'
import { e2eClient, userPool, userPoolClient } from './auth'

// ─────────────────────────────────────────────
// SSM OUTPUTS — read by apps/web/sst.config.ts at deploy time, which is why
// the api stack must be deployed before the web stack for any new stage.
// ─────────────────────────────────────────────
new aws.ssm.Parameter('SsmApiUrl', {
  name: `/infernolog/${$app.stage}/api-url`,
  type: 'String',
  value: api.url,
})

new aws.ssm.Parameter('SsmUserPoolId', {
  name: `/infernolog/${$app.stage}/user-pool-id`,
  type: 'String',
  value: userPool.id,
})

new aws.ssm.Parameter('SsmUserPoolClientId', {
  name: `/infernolog/${$app.stage}/user-pool-client-id`,
  type: 'String',
  value: userPoolClient.id,
})

new aws.ssm.Parameter('SsmCognitoDomain', {
  name: `/infernolog/${$app.stage}/cognito-domain`,
  type: 'String',
  value:
    $app.stage === 'production'
      ? 'infernolog.auth.us-east-1.amazoncognito.com'
      : `infernolog-${$app.stage}.auth.us-east-1.amazoncognito.com`,
})

// The E2E app client only exists on non-production stages, so this parameter
// does too — apps/web/e2e/run.ts reads it to know which client to mint the
// suite's tokens with, and a missing parameter is how "you pointed the suite
// at production" surfaces.
if (e2eClient) {
  new aws.ssm.Parameter('SsmE2eClientId', {
    name: `/infernolog/${$app.stage}/e2e-client-id`,
    type: 'String',
    value: e2eClient.id,
  })
}

// ─────────────────────────────────────────────
// OUTPUTS — returned from sst.config.ts's run()
// ─────────────────────────────────────────────
export const outputs = {
  api: api.url,
  userPoolId: userPool.id,
  userPoolClientId: userPoolClient.id,
}
