import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms'

// Symmetric encryption for small secrets (GDDL API keys) using AWS KMS.
//
// The key material never leaves KMS — we send plaintext up and store the
// returned ciphertext blob (base64) in the DB. GDDL keys are well under the
// 4KB KMS Encrypt limit, so direct encryption is sufficient; no envelope
// encryption is needed.
//
// SECURITY: plaintext secrets passed through here must NEVER be logged. Do not
// add logging of arguments or return values to this module.

const client = new KMSClient({})

function keyId(): string {
  const id = process.env.GDDL_KMS_KEY_ID
  if (!id) {
    // Deliberately vague — never echo any secret-adjacent context.
    throw new Error('GDDL_KMS_KEY_ID is not configured')
  }
  return id
}

/**
 * Encrypts a plaintext secret and returns the ciphertext as base64.
 */
export async function encryptSecret(plaintext: string): Promise<string> {
  const res = await client.send(
    new EncryptCommand({
      KeyId: keyId(),
      Plaintext: Buffer.from(plaintext, 'utf8'),
    })
  )
  if (!res.CiphertextBlob) {
    throw new Error('KMS returned no ciphertext')
  }
  return Buffer.from(res.CiphertextBlob).toString('base64')
}

/**
 * Decrypts a base64 ciphertext blob produced by encryptSecret.
 */
export async function decryptSecret(ciphertextBase64: string): Promise<string> {
  const res = await client.send(
    new DecryptCommand({
      KeyId: keyId(),
      CiphertextBlob: Buffer.from(ciphertextBase64, 'base64'),
    })
  )
  if (!res.Plaintext) {
    throw new Error('KMS returned no plaintext')
  }
  return Buffer.from(res.Plaintext).toString('utf8')
}
