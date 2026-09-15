import { describe, expect, it } from 'vitest'
import { sourceIp } from './requestContext'

describe('sourceIp', () => {
  it('reads the IP API Gateway saw', () => {
    expect(
      sourceIp({
        env: { requestContext: { http: { sourceIp: '203.0.113.9' } } },
      })
    ).toBe('203.0.113.9')
  })

  it.each([
    ['no env', undefined],
    ['no request context', {}],
    ['an empty IP', { requestContext: { http: { sourceIp: '' } } }],
    ['a non-string IP', { requestContext: { http: { sourceIp: 42 } } }],
  ])('falls back to one shared bucket with %s', (_label, env) => {
    expect(sourceIp({ env })).toBe('unknown')
  })
})
