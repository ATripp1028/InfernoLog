// Logic for the Account settings section (AccountSection.tsx): the Connected
// accounts rows and the Discord connect/disconnect actions.

import { useState } from 'react'
import { toast } from '@/components/generic/sonner'
import {
  findDiscordIdentity,
  useConnectDiscord,
  useDisconnectDiscord,
  type MeData,
} from '@/lib/api/me'
import { discordIdentifier, signInMethodRows } from './connectedAccounts'

/**
 * Everything AccountSection renders beyond its props: the rows to show, and
 * the Discord actions with their pending and confirmation state.
 */
export function useAccountSection(me: MeData) {
  const connect = useConnectDiscord()
  const disconnect = useDisconnectDiscord()
  const [confirmDiscordDisconnect, setConfirmDiscordDisconnect] =
    useState(false)

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

  return {
    signInMethods: signInMethodRows(me.identities),
    discordLinked: findDiscordIdentity(me.identities) !== undefined,
    discordIdentifier: discordIdentifier(me.identities),
    connectPending: connect.isPending,
    disconnectPending: disconnect.isPending,
    confirmDiscordDisconnect,
    setConfirmDiscordDisconnect,
    handleConnect,
    handleDisconnect,
  }
}
