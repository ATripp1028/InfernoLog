// Request bodies and error codes for the email-and-password auth routes.
//
// ⚠️ CREDENTIALS — these schemas carry passwords and verification codes. See
// credentials.ts and CLAUDE.md "Credential handling".

import { z } from 'zod'
import { EmailSchema, PASSWORD_MAX_LENGTH, PasswordSchema } from './credentials'

/** A six-digit emailed verification code. The message never echoes the value. */
export const VerificationCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code from the email')

/** POST /v1/auth/password-signup/start */
export const PasswordSignupStartSchema = z.object({
  email: EmailSchema,
})
export type PasswordSignupStartBody = z.infer<typeof PasswordSignupStartSchema>

/** POST /v1/auth/password-signup/verify */
export const PasswordSignupVerifySchema = z.object({
  email: EmailSchema,
  verificationCode: VerificationCodeSchema,
  password: PasswordSchema,
})
export type PasswordSignupVerifyBody = z.infer<
  typeof PasswordSignupVerifySchema
>

/**
 * A Google re-confirmation: the ID token from signing in with Google moments
 * ago (web `lib/googleProof.ts`), which the API checks is fresh and belongs to
 * the right identity. Bounded only so an absurd body is refused early.
 */
export const GoogleProofSchema = z.string().min(1).max(8192)

/** PUT /v1/me/password */
export const ChangePasswordSchema = z.object({
  // Not checked against the policy: an old password predating a policy change
  // must still be accepted as proof.
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: PasswordSchema,
  signOutOthers: z.boolean(),
})
export type ChangePasswordBody = z.infer<typeof ChangePasswordSchema>

/** POST /v1/me/password/setup/start */
export const PasswordSetupStartSchema = z.object({
  email: EmailSchema,
  googleProof: GoogleProofSchema,
})
export type PasswordSetupStartBody = z.infer<typeof PasswordSetupStartSchema>

/** POST /v1/me/password/setup */
export const PasswordSetupSchema = z.object({
  email: EmailSchema,
  newPassword: PasswordSchema,
  googleProof: GoogleProofSchema,
  // Required only when `email` is not already the account's email.
  verificationCode: VerificationCodeSchema.optional(),
})
export type PasswordSetupBody = z.infer<typeof PasswordSetupSchema>

/** POST /v1/me/identities/google */
export const ConnectGoogleSchema = z.object({
  googleProof: GoogleProofSchema,
})
export type ConnectGoogleBody = z.infer<typeof ConnectGoogleSchema>

/**
 * POST /v1/me/email/start. Proves who is asking with the current password when
 * the account has one, and with a fresh Google proof when it doesn't — the
 * route decides which is required.
 */
export const EmailChangeStartSchema = z.object({
  newEmail: EmailSchema,
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH).optional(),
  googleProof: GoogleProofSchema.optional(),
})
export type EmailChangeStartBody = z.infer<typeof EmailChangeStartSchema>

/** POST /v1/me/email/verify */
export const EmailChangeVerifySchema = z.object({
  newEmail: EmailSchema,
  verificationCode: VerificationCodeSchema,
})
export type EmailChangeVerifyBody = z.infer<typeof EmailChangeVerifySchema>

/**
 * Machine-readable `code` values on auth route errors, which the frontend
 * branches on. The `error` string beside each is for display.
 */
export const AuthErrorCode = {
  /** The address already belongs to an account (only said to its proven owner). */
  ACCOUNT_EXISTS: 'ACCOUNT_EXISTS',
  /** A verification code was wrong, expired, used, or guessed too often. */
  INVALID_CODE: 'INVALID_CODE',
  /** Too many codes requested for this address or from this network. */
  RATE_LIMITED: 'RATE_LIMITED',
  /** A token without a verified email tried to create an account. */
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  /** The current password given to confirm a change was wrong. */
  CURRENT_PASSWORD_INCORRECT: 'CURRENT_PASSWORD_INCORRECT',
  /** Cognito locked password checks after repeated failures. */
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  /** A Google re-confirmation was missing, stale, or for the wrong identity. */
  REAUTH_REQUIRED: 'REAUTH_REQUIRED',
  /** The account already has an email-and-password sign-in. */
  PASSWORD_EXISTS: 'PASSWORD_EXISTS',
  /** The account has no email-and-password sign-in to change. */
  NO_PASSWORD: 'NO_PASSWORD',
  /** That Google account is already connected to this account. */
  ALREADY_CONNECTED: 'ALREADY_CONNECTED',
  /** That Google account is connected to a different InfernoLog account. */
  CONNECTED_ELSEWHERE: 'CONNECTED_ELSEWHERE',
  /** Removing this would leave the account with no way to sign in. */
  LAST_SIGN_IN_METHOD: 'LAST_SIGN_IN_METHOD',
  /** The new email is already the account's email. */
  SAME_EMAIL: 'SAME_EMAIL',
} as const
export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode]
