import { useEffect, useState } from 'react'
import { useSearch, useNavigate } from '@tanstack/react-router'
import { useConnectDiscord, useDisconnectDiscord, useMe } from '@/lib/api/me'

const DISCORD_BANNER_TIMEOUT_MS = 5000

export function Settings() {
  const me = useMe()
  const connect = useConnectDiscord()
  const disconnect = useDisconnectDiscord()
  const search = useSearch({ from: '/_authenticated/settings' }) as {
    discord?: 'connected' | 'error'
    reason?: string
  }
  const navigate = useNavigate()
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (!search.discord) return
    if (search.discord === 'connected') {
      setBanner({ kind: 'success', message: 'Discord account connected.' })
    } else if (search.discord === 'error') {
      setBanner({ kind: 'error', message: discordErrorMessage(search.reason) })
    }
    // Strip the params from the URL so the banner doesn't reappear on refresh.
    void navigate({ to: '/settings', replace: true, search: {} })
  }, [search.discord, search.reason, navigate])

  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), DISCORD_BANNER_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [banner])

  const handleConnect = async () => {
    try {
      const { url } = await connect.mutateAsync()
      window.location.href = url
    } catch (err) {
      setBanner({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to start Discord connection',
      })
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnect.mutateAsync()
      setBanner({ kind: 'success', message: 'Discord account disconnected.' })
    } catch (err) {
      setBanner({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to disconnect Discord',
      })
    }
  }

  const discordId = me.data?.discordId ?? null

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-2 text-text-secondary">Manage your settings</p>

      {banner && (
        <div
          role="status"
          style={{
            marginTop: 16,
            padding: '8px 12px',
            borderRadius: 6,
            background: banner.kind === 'success' ? '#d1fae5' : '#fee2e2',
            color: banner.kind === 'success' ? '#065f46' : '#991b1b',
          }}
        >
          {banner.message}
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Connected accounts</h2>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ minWidth: 100 }}>Discord</span>
          {discordId ? (
            <>
              <span className="text-text-secondary">Connected ({discordId})</span>
              <button onClick={handleDisconnect} disabled={disconnect.isPending}>
                {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </>
          ) : (
            <button onClick={handleConnect} disabled={connect.isPending}>
              {connect.isPending ? 'Opening Discord…' : 'Connect Discord'}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

function discordErrorMessage(reason?: string): string {
  switch (reason) {
    case 'invalid_state':
      return 'The Discord connection link expired or was tampered with. Please try again.'
    case 'missing_code':
    case 'missing_state':
      return 'Discord didn’t return the required information. Please try again.'
    case 'token_exchange_failed':
    case 'user_fetch_failed':
      return 'Couldn’t reach Discord. Please try again.'
    case 'already_linked_elsewhere':
      return 'That Discord account is already connected to a different InfernoLog user.'
    case 'internal_error':
    default:
      return 'Something went wrong connecting Discord. Please try again.'
  }
}
