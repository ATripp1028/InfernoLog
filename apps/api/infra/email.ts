/// <reference path="../.sst/platform/config.d.ts" />

// ─────────────────────────────────────────────
// EMAIL — Amazon SES, set up by hand, referenced here
//
// The SES domain identity for infernolog.com was created in the AWS console,
// NOT by SST, along with everything that goes with it: Easy DKIM records in
// Route 53, the custom MAIL FROM domain mail.infernolog.com, the DMARC record,
// and production access. Do not add any of it as an SST resource. An identity
// belongs to the whole AWS account, which every stage shares, so a resource
// here would collide with the console-made identity and with every other
// stage deploying the same one. This module only builds references to it.
//
// Two things send through the identity, on every stage:
//   - Cognito, for forgot-password codes (the pool's emailConfiguration and
//     the sending-authorization policy, both in infra/auth.ts)
//   - the API, for verification codes and account notices
//     (src/services/email). Routes that send need `sesSendPermission` and
//     `emailEnvironment`.
// ─────────────────────────────────────────────

/** The verified SES domain. */
export const SES_DOMAIN = 'infernolog.com'

const account = aws.getCallerIdentityOutput({})

/** The account every stage deploys to and the SES identity lives in. */
export const awsAccountId = account.accountId

/**
 * The SES identity's ARN. The region is fixed in sst.config.ts, and SES
 * identities are regional, so it lives in us-east-1 as well.
 */
export const sesIdentityArn = $interpolate`arn:aws:ses:us-east-1:${account.accountId}:identity/${SES_DOMAIN}`

/** The From header on everything InfernoLog sends. No inbox sits behind it. */
export const EMAIL_FROM = `InfernoLog <no-reply@${SES_DOMAIN}>`

/**
 * Where replies go: the support alias. Unset for now, which leaves replies
 * addressed to no-reply@, where nothing receives them. The email-changed
 * notice tells people to reply if a change wasn't theirs, so set this before
 * that email ships (PR 4).
 */
export const EMAIL_REPLY_TO: string | undefined = undefined

/** Environment for a Lambda that calls `sendEmail`. */
export const emailEnvironment: Record<string, $util.Input<string>> = {
  EMAIL_FROM,
  SES_IDENTITY_ARN: sesIdentityArn,
}
if (EMAIL_REPLY_TO) emailEnvironment.EMAIL_REPLY_TO = EMAIL_REPLY_TO

/** The IAM permission a Lambda that calls `sendEmail` needs. */
export const sesSendPermission = {
  actions: ['ses:SendEmail'],
  resources: [sesIdentityArn],
}
