import type { DefineAuthChallengeTriggerHandler } from 'aws-lambda'
import { logger } from '../utils/logger'

export const handler: DefineAuthChallengeTriggerHandler = async (event) => {
  const { session } = event.request

  if (session.length === 0) {
    // First call — issue a single custom challenge
    event.response.challengeName = 'CUSTOM_CHALLENGE'
    event.response.failAuthentication = false
    event.response.issueTokens = false
  } else if (
    session.length === 1 &&
    session[0]?.challengeName === 'CUSTOM_CHALLENGE' &&
    session[0]?.challengeResult === true
  ) {
    // Verify trigger accepted our signed nonce — issue tokens
    event.response.failAuthentication = false
    event.response.issueTokens = true
  } else {
    // Anything else is a failed/replayed attempt
    event.response.failAuthentication = true
    event.response.issueTokens = false
  }

  logger.info(
    {
      userAttributes: event.request.userAttributes,
      session: event.request.session,
      response: event.response,
    },
    'DefineAuthChallenge trigger executed'
  )

  return event
}
