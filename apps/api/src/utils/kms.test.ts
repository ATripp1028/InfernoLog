/**
 * Unit tests for the KMS secret wrapper.
 *
 * Two things matter here: the plaintext/base64 encoding boundary (getting it
 * wrong corrupts every stored GDDL key), and the module's security rule that
 * nothing secret-adjacent leaks into an error. The KMS client is mocked; no
 * AWS calls.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── mocks ───────────────────────────────────────────────────────────────────

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }))

vi.mock('@aws-sdk/client-kms', () => ({
  KMSClient: class {
    send = mockSend
  },
  EncryptCommand: class {
    readonly type = 'Encrypt'
    constructor(public input: { KeyId: string; Plaintext: Uint8Array }) {}
  },
  DecryptCommand: class {
    readonly type = 'Decrypt'
    constructor(public input: { KeyId: string; CiphertextBlob: Uint8Array }) {}
  },
}))

const { encryptSecret, decryptSecret } = await import('./kms')

// ─── helpers ─────────────────────────────────────────────────────────────────

const KEY_ID = 'arn:aws:kms:us-east-1:1234:key/abcd'
const SECRET = 'gddl-api-key-super-secret'

/** The command object handed to the most recent client.send call. */
function lastCommand(): {
  type: string
  input: { KeyId: string; Plaintext?: Uint8Array; CiphertextBlob?: Uint8Array }
} {
  return mockSend.mock.lastCall?.[0]
}

beforeEach(() => {
  mockSend.mockReset()
  vi.stubEnv('GDDL_KMS_KEY_ID', KEY_ID)
})

// ─── encryptSecret ───────────────────────────────────────────────────────────

describe('encryptSecret', () => {
  it('sends the plaintext as utf8 bytes under the configured key', async () => {
    mockSend.mockResolvedValue({ CiphertextBlob: Buffer.from('cipher') })

    await encryptSecret(SECRET)

    const cmd = lastCommand()
    expect(cmd.type).toBe('Encrypt')
    expect(cmd.input.KeyId).toBe(KEY_ID)
    expect(Buffer.from(cmd.input.Plaintext!).toString('utf8')).toBe(SECRET)
  })

  it('returns the ciphertext blob as base64', async () => {
    const blob = Buffer.from([0x00, 0xff, 0x10, 0x42])
    mockSend.mockResolvedValue({ CiphertextBlob: blob })

    await expect(encryptSecret(SECRET)).resolves.toBe(blob.toString('base64'))
  })

  it('handles non-ASCII plaintext without mangling it', async () => {
    mockSend.mockResolvedValue({ CiphertextBlob: Buffer.from('x') })

    await encryptSecret('kéy-—-🔑')

    expect(Buffer.from(lastCommand().input.Plaintext!).toString('utf8')).toBe(
      'kéy-—-🔑'
    )
  })

  it('throws when KMS returns no ciphertext', async () => {
    mockSend.mockResolvedValue({})
    await expect(encryptSecret(SECRET)).rejects.toThrow(
      'KMS returned no ciphertext'
    )
  })
})

// ─── decryptSecret ───────────────────────────────────────────────────────────

describe('decryptSecret', () => {
  it('decodes the base64 blob back to bytes before sending', async () => {
    mockSend.mockResolvedValue({ Plaintext: Buffer.from(SECRET) })
    const blob = Buffer.from([0x00, 0xff, 0x10, 0x42])

    await decryptSecret(blob.toString('base64'))

    const cmd = lastCommand()
    expect(cmd.type).toBe('Decrypt')
    expect(cmd.input.KeyId).toBe(KEY_ID)
    expect(Buffer.from(cmd.input.CiphertextBlob!)).toEqual(blob)
  })

  it('returns the plaintext as a utf8 string', async () => {
    mockSend.mockResolvedValue({ Plaintext: Buffer.from('kéy-—-🔑', 'utf8') })
    await expect(decryptSecret('AAA=')).resolves.toBe('kéy-—-🔑')
  })

  it('throws when KMS returns no plaintext', async () => {
    mockSend.mockResolvedValue({})
    await expect(decryptSecret('AAA=')).rejects.toThrow(
      'KMS returned no plaintext'
    )
  })
})

// ─── round trip ──────────────────────────────────────────────────────────────

describe('encrypt/decrypt round trip', () => {
  it('recovers the original secret through a KMS that echoes bytes', async () => {
    // Stands in for real KMS: whatever bytes go up come back down.
    mockSend.mockImplementation(
      (cmd: { type: string; input: Record<string, Uint8Array> }) =>
        cmd.type === 'Encrypt'
          ? { CiphertextBlob: cmd.input.Plaintext }
          : { Plaintext: cmd.input.CiphertextBlob }
    )

    const stored = await encryptSecret(SECRET)
    expect(stored).not.toContain(SECRET) // base64, not the raw value
    await expect(decryptSecret(stored)).resolves.toBe(SECRET)
  })
})

// ─── key configuration ───────────────────────────────────────────────────────

describe('missing key configuration', () => {
  it.each([
    ['encryptSecret', () => encryptSecret(SECRET)],
    ['decryptSecret', () => decryptSecret('AAA=')],
  ])(
    '%s throws before calling KMS when GDDL_KMS_KEY_ID is unset',
    async (_label, call) => {
      vi.stubEnv('GDDL_KMS_KEY_ID', undefined)

      await expect(call()).rejects.toThrow('GDDL_KMS_KEY_ID is not configured')
      expect(mockSend).not.toHaveBeenCalled()
    }
  )

  it('keeps the secret out of the configuration error', async () => {
    // The module's stated rule: never echo secret-adjacent context.
    vi.stubEnv('GDDL_KMS_KEY_ID', undefined)

    await expect(encryptSecret(SECRET)).rejects.toSatisfy(
      (err: Error) => !err.message.includes(SECRET)
    )
  })
})
