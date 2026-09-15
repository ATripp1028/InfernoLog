import { KeyRound } from 'lucide-react'
import { SettingsSection } from '@/components/generic/settings-section'
import { UsernameEditor } from '@/components/inputs/UsernameEditor'
import { ConnectedAccountRow } from '@/components/data/ConnectedAccountRow'
import { GddlApiKeyEditor } from '@/components/inputs/GddlApiKeyEditor'
import { Button } from '@/components/generic/button'
import { AlertDialog } from '@/components/generic/alert-dialog'
import { DiscordIcon, GoogleIcon } from '@/components/data/providerIcons'
import type { MeData } from '@/lib/api/me'
import type { AuthProvider } from '@/lib/api/wireEnums'
import { useAccountSection } from './useAccountSection'

interface AccountSectionProps {
  me: MeData
}

/**
 * Account settings: username, connected accounts, GDDL API key.
 *
 * Connected accounts lists every way the user can sign in, then the Discord
 * link, which can be connected and disconnected here.
 */
export function AccountSection({ me }: AccountSectionProps) {
  const {
    signInMethods,
    discordLinked,
    discordIdentifier,
    connectPending,
    disconnectPending,
    confirmDiscordDisconnect,
    setConfirmDiscordDisconnect,
    handleConnect,
    handleDisconnect,
  } = useAccountSection(me)

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
          {signInMethods.map((method) => (
            <ConnectedAccountRow
              key={method.id}
              icon={<ProviderIcon provider={method.provider} />}
              providerName={method.providerName}
              identifier={method.identifier}
              status={
                <span className="text-xs text-muted-foreground">
                  Sign-in method
                </span>
              }
            />
          ))}
          <ConnectedAccountRow
            icon={<DiscordIcon />}
            providerName="Discord"
            identifier={discordIdentifier}
            action={
              discordLinked ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDiscordDisconnect(true)}
                  disabled={disconnectPending}
                >
                  {disconnectPending ? 'Disconnecting…' : 'Disconnect'}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => void handleConnect()}
                  disabled={connectPending}
                >
                  {connectPending ? 'Opening Discord…' : 'Connect'}
                </Button>
              )
            }
          />
          <GddlApiKeyEditor me={me} />
        </div>
      </div>

      <AlertDialog
        open={confirmDiscordDisconnect}
        onOpenChange={setConfirmDiscordDisconnect}
        title="Disconnect Discord?"
        description="This unlinks your Discord account from InfernoLog."
        confirmLabel="Disconnect"
        destructive
        isPending={disconnectPending}
        onConfirm={() => void handleDisconnect()}
      />
    </SettingsSection>
  )
}

function ProviderIcon({ provider }: { provider: AuthProvider }) {
  switch (provider) {
    case 'GOOGLE':
      return <GoogleIcon />
    case 'DISCORD':
      return <DiscordIcon />
    case 'PASSWORD':
      return <KeyRound size={18} aria-hidden="true" />
  }
}
