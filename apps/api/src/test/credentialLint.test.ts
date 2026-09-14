/**
 * Proves the credential lint rule (eslint.credentials.mjs) actually fires.
 *
 * Lint passing on the real tree only shows nothing is currently wrong; it
 * would pass just the same if a config change had silently dropped the rule.
 * This lints known-bad and known-good snippets through the app's real ESLint
 * config.
 */

import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const eslint = new ESLint({ cwd: apiRoot })

async function credentialErrors(code: string): Promise<number> {
  const [result] = await eslint.lintText(code, {
    filePath: resolve(apiRoot, 'src/credentialLintFixture.ts'),
  })
  return (result?.messages ?? []).filter(
    (m) => m.ruleId === 'no-restricted-syntax'
  ).length
}

const DECLS = `
declare const logger: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void }
declare const Sentry: { captureException: (...a: unknown[]) => void }
declare function captureMessage(...a: unknown[]): void
declare const password: string
declare const body: { newPassword: string; verificationCode: string; email: string }
declare const wrapped: { reveal(): string }
declare const userId: string
`

describe('credential lint rule', () => {
  it.each([
    ['a password passed to the logger', `logger.info({ password }, 'x')`],
    ['a nested credential field', `logger.error({ x: body.newPassword }, 'x')`],
    ['a verification code', `console.log(body.verificationCode)`],
    ['a revealed Sensitive value', `logger.info({ v: wrapped.reveal() }, 'x')`],
    [
      'a credential sent to Sentry',
      `Sentry.captureException(new Error(password))`,
    ],
    ['a bare capture import', `captureMessage(\`bad \${password}\`)`],
    [
      'a credential in an error message',
      `throw new Error(\`bad \${password}\`)`,
    ],
  ])('rejects %s', async (_label, snippet) => {
    expect(await credentialErrors(DECLS + snippet)).toBeGreaterThan(0)
  })

  it.each([
    ['ordinary structured logging', `logger.info({ userId }, 'Signed in')`],
    [
      'a static message about passwords',
      `logger.info({ userId }, 'Password changed')`,
    ],
    [
      'using a credential outside a sink',
      `const n = password.length; logger.info({ n }, 'x')`,
    ],
  ])('allows %s', async (_label, snippet) => {
    expect(await credentialErrors(DECLS + snippet)).toBe(0)
  })
})
