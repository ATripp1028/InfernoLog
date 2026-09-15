// Outgoing email, through Amazon SES.
//
// The SES identity (infernolog.com) is set up by hand in the AWS console, not
// by SST — it belongs to the whole account, and every stage sends through it.
// infra/email.ts supplies the environment below.
//
// ⚠️ CREDENTIALS — a message may carry a verification code. Never log a message,
// its body, or its recipient. See CLAUDE.md "Credential handling".

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import type { EmailContent } from './templates'

export {
  verificationCodeEmail,
  existingAccountEmail,
  emailChangedEmail,
  type EmailContent,
} from './templates'

const ses = new SESv2Client({ region: process.env.AWS_REGION ?? 'us-east-1' })

/**
 * Sends one email.
 *
 * Reads `EMAIL_FROM` and `SES_IDENTITY_ARN` (required) and `EMAIL_REPLY_TO`
 * (optional) from the environment, set by infra/email.ts. Errors propagate:
 * the route's error handler reports them, and the SDK's errors carry neither
 * the recipient nor the body.
 *
 * @param to - The recipient address.
 * @param content - A message from one of the templates.
 */
export async function sendEmail(
  to: string,
  content: EmailContent
): Promise<void> {
  const from = process.env.EMAIL_FROM
  const identityArn = process.env.SES_IDENTITY_ARN
  if (!from || !identityArn) {
    throw new Error(
      'Email is not configured: set EMAIL_FROM and SES_IDENTITY_ARN'
    )
  }
  const replyTo = process.env.EMAIL_REPLY_TO

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: from,
      FromEmailAddressIdentityArn: identityArn,
      Destination: { ToAddresses: [to] },
      ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
      Content: {
        Simple: {
          Subject: { Data: content.subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: content.text, Charset: 'UTF-8' },
            Html: { Data: content.html, Charset: 'UTF-8' },
          },
        },
      },
    })
  )
}
