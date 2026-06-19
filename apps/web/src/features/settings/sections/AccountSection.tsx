import { SettingsSection } from '../components/SettingsSection'
import { UsernameEditor } from '../components/UsernameEditor'
import { ConnectedAccountRow } from '../components/ConnectedAccountRow'
import { GddlApiKeyEditor } from '../components/GddlApiKeyEditor'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/sonner'
import {
  useConnectDiscord,
  useDisconnectDiscord,
  type MeData,
} from '@/lib/api/me'

interface AccountSectionProps {
  me: MeData
}

export function AccountSection({ me }: AccountSectionProps) {
  const connect = useConnectDiscord()
  const disconnect = useDisconnectDiscord()

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
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to disconnect Discord'
      )
    }
  }

  return (
    <SettingsSection title="Account">
      <div className="space-y-2">
        <div className="text-sm font-medium text-foreground">Username</div>
        <UsernameEditor me={me} />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium text-foreground">
          Connected accounts
        </div>
        <div className="space-y-2">
          <ConnectedAccountRow
            icon={<GoogleIcon />}
            providerName="Google"
            identifier={me.email}
            status={
              <span className="text-xs text-muted-foreground">
                Primary login
              </span>
            }
          />
          <ConnectedAccountRow
            icon={<DiscordIcon />}
            providerName="Discord"
            identifier={me.discordId ? `Discord ID ${me.discordId}` : null}
            action={
              me.discordId ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleDisconnect()}
                  disabled={disconnect.isPending}
                >
                  {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => void handleConnect()}
                  disabled={connect.isPending}
                >
                  {connect.isPending ? 'Opening Discord…' : 'Connect'}
                </Button>
              )
            }
          />
          <GddlApiKeyEditor me={me} />
        </div>
      </div>
    </SettingsSection>
  )
}

function GoogleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.44a5.4 5.4 0 0 1-2.39 3.58v2.98h3.87c2.26-2.09 3.57-5.17 3.57-8.8z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.93l-3.87-2.98c-1.07.72-2.44 1.16-4.06 1.16-3.12 0-5.77-2.11-6.71-4.94H1.29v3.09A11.998 11.998 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.31a7.22 7.22 0 0 1 0-4.62V6.6H1.29a12.014 12.014 0 0 0 0 10.8l4-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A11.998 11.998 0 0 0 1.29 6.6l4 3.09C6.23 6.86 8.88 4.75 12 4.75z"
      />
    </svg>
  )
}

function DiscordIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.548-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}
