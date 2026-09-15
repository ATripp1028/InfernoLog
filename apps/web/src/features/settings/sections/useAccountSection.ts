// Logic for the Account settings section (AccountSection.tsx): the Connected
// accounts rows, showing or masking their emails, connecting Google and
// Discord, and removing a sign-in method.

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { signOut } from 'aws-amplify/auth'
import { toast } from '@/components/generic/sonner'
import {
  findDiscordIdentity,
  useConnectDiscord,
  useDisconnectDiscord,
  useRemoveSignInMethod,
  type MeData,
} from '@/lib/api/me'
import { startGoogleProof } from '@/lib/googleProof'
import { maskEmail } from '@/lib/maskEmail'
import { Sentry } from '@/lib/sentry'
import {
  discordIdentifier,
  hasGoogleSignIn,
  signInMethodRows,
  type SignInMethodRow,
} from './connectedAccounts'

/**
 * Everything AccountSection renders beyond its props: the rows to show, and
 * the connect, disconnect and remove actions with their pending and
 * confirmation state.
 */
export function useAccountSection(me: MeData) {
  const navigate = useNavigate()
  const connect = useConnectDiscord()
  const disconnect = useDisconnectDiscord()
  const remove = useRemoveSignInMethod()
  const [confirmDiscordDisconnect, setConfirmDiscordDisconnect] =
    useState(false)
  const [removeTarget, setRemoveTarget] = useState<SignInMethodRow | null>(null)
  const [connectingGoogle, setConnectingGoogle] = useState(false)
  // Emails start masked on every visit — Settings is a page people show on
  // stream. The choice to reveal them is never stored.
  const [showEmails, setShowEmails] = useState(false)

  const displayEmail = (email: string | null) =>
    email && !showEmails ? maskEmail(email) : email

  // Leaves for Discord's consent screen; the link itself is completed on the
  // way back, by DiscordLinkComplete.
  const handleConnect = async () => {
    try {
      const { url } = await connect.mutateAsync()
      window.location.href = url
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Failed to start Discord connection'
      )
    }
  }

  // Leaves for Google; GoogleProofComplete connects it on the way back.
  const handleConnectGoogle = async () => {
    setConnectingGoogle(true)
    try {
      await startGoogleProof('connect-google')
    } catch (err) {
      Sentry.captureException(err)
      toast.error('Couldn’t start connecting Google. Please try again.')
      setConnectingGoogle(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnect.mutateAsync()
      toast.success('Discord account disconnected')
      setConfirmDiscordDisconnect(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to disconnect Discord'
      )
    }
  }

  const handleRemove = async () => {
    if (!removeTarget) return
    try {
      const { signedOut } = await remove.mutateAsync(removeTarget.id)
      setRemoveTarget(null)
      if (signedOut) {
        // This session signed in with the method just removed and can no
        // longer reach the API, so end it and send the user to sign in.
        await signOut().catch(() => undefined)
        toast.success(
          `${removeTarget.providerName} removed. Sign in with another method.`
        )
        await navigate({ to: '/signin', replace: true })
        return
      }
      toast.success(`${removeTarget.providerName} removed`)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to remove sign-in method'
      )
    }
  }

  return {
    signInMethods: signInMethodRows(me.identities).map((row) => ({
      ...row,
      identifier: displayEmail(row.identifier),
    })),
    showEmails,
    toggleShowEmails: () => setShowEmails((shown) => !shown),
    canConnectGoogle: !hasGoogleSignIn(me.identities),
    connectingGoogle,
    handleConnectGoogle,
    discordLinked: findDiscordIdentity(me.identities) !== undefined,
    discordIdentifier: discordIdentifier(me.identities),
    connectPending: connect.isPending,
    disconnectPending: disconnect.isPending,
    confirmDiscordDisconnect,
    setConfirmDiscordDisconnect,
    handleConnect,
    handleDisconnect,
    removeTarget,
    setRemoveTarget,
    removePending: remove.isPending,
    handleRemove,
  }
}
