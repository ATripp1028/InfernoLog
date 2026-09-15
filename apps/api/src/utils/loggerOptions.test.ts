import { describe, expect, it } from 'vitest'
import pino from 'pino'
import { Writable } from 'stream'
import { SENSITIVE_FIELD_NAMES } from '@infernolog/core'
import { buildLoggerOptions } from './loggerOptions'

function capture() {
  const lines: string[] = []
  const sink = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk))
      done()
    },
  })
  return { logger: pino(buildLoggerOptions('info'), sink), lines }
}

describe('buildLoggerOptions', () => {
  it('redacts every credential field name at every supported depth', () => {
    const { logger, lines } = capture()
    SENSITIVE_FIELD_NAMES.forEach((name, i) => {
      const value = `Leak-Canary-${name}-${i}`
      logger.info({ [name]: value }, 'top')
      logger.info({ a: { [name]: value } }, 'one')
      logger.info({ a: { b: { [name]: value } } }, 'two')
      logger.info({ a: { b: { c: { [name]: value } } } }, 'three')
    })
    const output = lines.join('')
    expect(output).not.toMatch(/Leak-Canary-/)
    expect(output.match(/\[REDACTED\]/g)).toHaveLength(
      SENSITIVE_FIELD_NAMES.length * 4
    )
  })

  it('leaves ordinary fields, including error codes, intact', () => {
    const { logger, lines } = capture()
    logger.error({ err: { code: 'P2002' }, userId: 'u1' }, 'boom')
    expect(lines.join('')).toContain('P2002')
    expect(lines.join('')).toContain('u1')
  })

  it('falls back to LOG_LEVEL, then info', () => {
    expect(buildLoggerOptions().level).toBe(process.env.LOG_LEVEL || 'info')
    expect(buildLoggerOptions('warn').level).toBe('warn')
  })
})
