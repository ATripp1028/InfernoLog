// ⚠️ CREDENTIALS — the verification-code template is the one place a code is
// revealed on purpose, into the body of the email that delivers it. A built
// message therefore holds the plaintext: pass it straight to `sendEmail` and
// nowhere else. Never log a message or put one in an error. See CLAUDE.md
// "Credential handling".

import type { VerificationPurpose } from '@prisma/client'
import type { Sensitive } from '../../utils/sensitive'
import { CODE_TTL_MINUTES } from '../verification'

/** An email ready to send, minus its recipient. */
export interface EmailContent {
  subject: string
  text: string
  html: string
}

const PURPOSE_LINES: Record<VerificationPurpose, string> = {
  SIGNUP: 'Use this code to finish creating your InfernoLog account.',
  EMAIL_CHANGE: 'Use this code to make this address your InfernoLog email.',
  PASSWORD_SETUP:
    'Use this code to add a password to your InfernoLog account using this address.',
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function layout(paragraphs: string[]): string {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px">${p}</p>`)
    .join('')
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#171717">${body}</body></html>`
}

/**
 * The email carrying a verification code.
 *
 * The code is in the body only, never the subject: subjects show in lock-screen
 * notifications and inbox previews, including on a stream.
 *
 * @param purpose - What the code is for; changes the first line.
 * @param verificationCode - The code, revealed into the body of this message.
 */
export function verificationCodeEmail(
  purpose: VerificationPurpose,
  verificationCode: Sensitive
): EmailContent {
  const digits = verificationCode.reveal()
  const line = PURPOSE_LINES[purpose]
  const expiry = `It expires in ${CODE_TTL_MINUTES} minutes.`
  const ignore =
    "If you didn't ask for this, you can ignore this email. Nothing changes until the code is entered."
  return {
    subject: 'Your InfernoLog verification code',
    text: `${line}\n\n${digits}\n\n${expiry}\n\n${ignore}`,
    html: layout([
      escapeHtml(line),
      `<span style="font-family:ui-monospace,Menlo,monospace;font-size:28px;letter-spacing:6px;font-weight:600">${escapeHtml(digits)}</span>`,
      escapeHtml(expiry),
      escapeHtml(ignore),
    ]),
  }
}

/**
 * Sent instead of a code when someone asks to use an address that already
 * belongs to an account. The on-screen response is identical either way, so
 * only the address's owner learns the account exists.
 *
 * @param appUrl - The frontend origin, e.g. `https://infernolog.com`.
 */
export function existingAccountEmail(appUrl: string): EmailContent {
  const signIn = `${appUrl}/signin`
  const reset = `${appUrl}/forgot-password`
  const lead =
    'Someone tried to use this email address on InfernoLog, but it already belongs to an account.'
  const action =
    'If that was you, sign in instead, or reset your password if you’ve forgotten it.'
  const ignore =
    "If it wasn't you, you can ignore this email. Your account hasn't changed."
  return {
    subject: 'You already have an InfernoLog account',
    text: `${lead}\n\n${action}\n\nSign in: ${signIn}\nReset password: ${reset}\n\n${ignore}`,
    html: layout([
      escapeHtml(lead),
      escapeHtml(action),
      `<a href="${escapeHtml(signIn)}">Sign in</a> &middot; <a href="${escapeHtml(reset)}">Reset password</a>`,
      escapeHtml(ignore),
    ]),
  }
}

/**
 * Sent to an account's previous address after its email changes, so an
 * unwanted change is noticed. Names no address: the old inbox may no longer be
 * the owner's.
 */
export function emailChangedEmail(): EmailContent {
  const lead = 'The email address on your InfernoLog account was just changed.'
  const help =
    "If you made this change, there's nothing to do. If you didn't, reply to this email right away so we can help secure your account."
  return {
    subject: 'Your InfernoLog email was changed',
    text: `${lead}\n\n${help}`,
    html: layout([escapeHtml(lead), escapeHtml(help)]),
  }
}
