/// <reference path="../.sst/platform/config.d.ts" />

// KMS — encrypts user GDDL API keys at rest. Only the gddl-key routes and the
// GDDL sync worker are granted Encrypt/Decrypt on this key (see
// infra/routes/gddl.ts and infra/workers.ts); no other Lambda can read a
// stored key.
export const gddlKmsKey = new aws.kms.Key('GddlApiKeyKey', {
  description: `InfernoLog ${$app.stage} — encrypts user GDDL API keys`,
  enableKeyRotation: true,
})

new aws.kms.Alias('GddlApiKeyKeyAlias', {
  name: `alias/infernolog-${$app.stage}-gddl-api-key`,
  targetKeyId: gddlKmsKey.keyId,
})
