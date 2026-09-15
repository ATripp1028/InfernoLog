// ⚠️ CREDENTIALS — lint rules that keep passwords and verification codes out of
// logs, error reports, and error messages. Shared by apps/api and apps/web;
// see CLAUDE.md "Credential handling".
//
// The rules key off names, so they depend on one convention: a variable or
// field holding a credential is named with `password` or `verificationCode`
// (never a bare `code`, which means error codes and level codes elsewhere in
// this repo). A value wrapped in the API's `Sensitive` is caught through its
// `.reveal()` call instead.
//
// They flag anything credential-named inside the call, including a harmless
// `hasPassword` flag. That is deliberate: rename it or log something else
// rather than disabling the rule, and never add an eslint-disable for it.

/** Identifier names that hold, or unwrap to, a credential. */
const CREDENTIAL_NAME = '/password|verificationCode/i'

/** Calls whose arguments end up in a log line, a report, or a message. */
const SINKS = [
  // logger.info(...), console.error(...), Sentry.captureException(...)
  'CallExpression[callee.object.name=/^(logger|console|Sentry)$/]',
  // A bare captureException(...) / captureMessage(...) import
  'CallExpression[callee.name=/^(captureException|captureMessage|addBreadcrumb|setExtra|setContext)$/]',
  // new Error(...), new ValidationError(...) — messages get logged and reported
  'NewExpression[callee.name=/Error$/]',
]

const MESSAGE =
  'Credentials (passwords, verification codes) must never reach a log, console, Sentry call, or error message. See CLAUDE.md "Credential handling".'

/** The `no-restricted-syntax` entries enforcing the credential rules. */
export const credentialRestrictedSyntax = SINKS.flatMap((sink) => [
  { selector: `${sink} Identifier[name=${CREDENTIAL_NAME}]`, message: MESSAGE },
  {
    selector: `${sink} CallExpression[callee.property.name='reveal']`,
    message: MESSAGE,
  },
])

/** Drop-in rules object for an ESLint flat-config block. */
export const credentialRules = {
  'no-restricted-syntax': ['error', ...credentialRestrictedSyntax],
}
