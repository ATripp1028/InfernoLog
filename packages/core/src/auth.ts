// Request bodies and error codes for the email-and-password auth routes.
//
// ⚠️ CREDENTIALS — these schemas carry passwords and verification codes. See
// credentials.ts and CLAUDE.md "Credential handling".

import { z } from 'zod'
import { EmailSchema, PasswordSchema } from './credentials'

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
} as const
export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode]
