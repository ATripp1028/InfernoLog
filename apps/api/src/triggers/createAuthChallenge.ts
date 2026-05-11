import type { CreateAuthChallengeTriggerHandler } from 'aws-lambda'
import { logger } from '../utils/logger'

export const handler: CreateAuthChallengeTriggerHandler = async (event) => {
  // No challenge is presented to the end user — the Discord callback Lambda
  // already verified Discord OAuth and will respond with a server-signed
  // nonce. Verify trigger does the actual checking.
  if (event.request.challengeName === 'CUSTOM_CHALLENGE') {
    // Cognito rejects empty challenge parameters with a misleading
    // NotAuthorizedException, so put at least one key in each.
    event.response.publicChallengeParameters = { type: 'discord_oauth' }
    event.response.privateChallengeParameters = { type: 'discord_oauth' }
    event.response.challengeMetadata = 'DISCORD_OAUTH'
  }

  logger.info(
    {
      userAttributes: event.request.userAttributes,
      session: event.request.session,
      challengeName: event.request.challengeName,
    },
    'CreateAuthChallenge trigger executed'
  )

  return event
}
