import { describe, expect, it } from 'vitest'
import { inspect } from 'util'
import pino from 'pino'
import { Writable } from 'stream'
import { Sensitive } from './sensitive'

// `Leak-Canary-` is allowlisted in .gitleaks.toml.
const SECRET = 'Leak-Canary-Pa55!sensitive'

describe('Sensitive', () => {
  it('reveals the plaintext only through reveal()', () => {
    expect(new Sensitive(SECRET).reveal()).toBe(SECRET)
  })

  it('redacts itself in every way a value is usually printed', () => {
    const wrapped = new Sensitive(SECRET)
    const printed = [
      String(wrapped),
      `${wrapped}`,
      'x' + wrapped,
      JSON.stringify(wrapped),
      JSON.stringify({ password: wrapped }),
      inspect(wrapped),
      inspect({ nested: { wrapped } }, { depth: 10 }),
      JSON.stringify({ ...wrapped }),
      JSON.stringify(Object.entries(wrapped)),
    ]
    for (const output of printed) {
      expect(output).not.toContain(SECRET)
    }
    expect(String(wrapped)).toBe('[REDACTED]')
    // String() goes through Symbol.toPrimitive; a direct call is its own path.
    expect(wrapped.toString()).toBe('[REDACTED]')
  })

  it('stays redacted when logged through Pino', () => {
    const lines: string[] = []
    const sink = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk))
        done()
      },
    })
    pino(sink).info({ body: { password: new Sensitive(SECRET) } }, 'login')
    expect(lines.join('')).not.toContain(SECRET)
    expect(lines.join('')).toContain('[REDACTED]')
  })

  it('compares without revealing', () => {
    expect(new Sensitive(SECRET).equals(new Sensitive(SECRET))).toBe(true)
    expect(new Sensitive(SECRET).equals(new Sensitive('other'))).toBe(false)
  })
})
