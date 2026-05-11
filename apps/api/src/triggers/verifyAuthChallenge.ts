import type { VerifyAuthChallengeResponseTriggerHandler } from 'aws-lambda'
import { createHmac, timingSafeEqual } from 'crypto'

const NONCE_TTL_SECONDS = 60

export const handler: VerifyAuthChallengeResponseTriggerHandler = async (event) => {
  event.response.answerCorrect = false

  const answer = event.request.challengeAnswer
  const secret = process.env.COGNITO_CUSTOM_AUTH_SECRET
  const expectedSub = event.request.userAttributes.sub

  if (!answer || !secret || !expectedSub) return event

  const parts = answer.split('.')
  if (parts.length !== 3) return event
  const [sub, ts, sig] = parts as [string, string, string]

  if (sub !== expectedSub) return event

  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum)) return event
  const ageSeconds = Math.floor(Date.now() / 1000) - tsNum
  if (ageSeconds < 0 || ageSeconds > NONCE_TTL_SECONDS) return event

  const expected = createHmac('sha256', secret).update(`${sub}.${ts}`).digest('hex')
  const sigBuf = Buffer.from(sig, 'hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  if (sigBuf.length !== expectedBuf.length) return event
  if (!timingSafeEqual(sigBuf, expectedBuf)) return event

  event.response.answerCorrect = true
  return event
}
