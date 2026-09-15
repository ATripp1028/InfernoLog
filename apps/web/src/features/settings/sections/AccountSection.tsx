import { Eye, EyeOff, KeyRound } from 'lucide-react'
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
import { PasswordSettings } from './password/PasswordSettings'
import { EmailSettings } from './email/EmailSettings'

interface AccountSectionProps {
  me: MeData
}

/**
 * Account settings: username, connected accounts, password, GDDL API key.
 *
 * Connected accounts lists every way the user can sign in — each removable
 * while another remains — an offer to connect Google when it isn't one, then
 * the Discord link. Emails are masked until the user asks to see them.
 */
export function AccountSection({ me }: AccountSectionProps) {
  const {
    signInMethods,
    showEmails,
    toggleShowEmails,
    canConnectGoogle,
    connectingGoogle,
    handleConnectGoogle,
    discordLinked,
    discordIdentifier,
    connectPending,
    disconnectPending,
    confirmDiscordDisconnect,
    setConfirmDiscordDisconnect,
    handleConnect,
    handleDisconnect,
    removeTarget,
    setRemoveTarget,
    removePending,
    handleRemove,
  } = useAccountSection(me)

  return (
    <SettingsSection title="Account">
      <div className="space-y-2">
        <div className="text-sm font-medium text-foreground">Username</div>
        <UsernameEditor me={me} />
      </div>

      <EmailSettings me={me} showEmails={showEmails} />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-foreground">
            Connected accounts
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleShowEmails}
            aria-pressed={showEmails}
          >
            {showEmails ? (
              <EyeOff size={14} aria-hidden="true" />
            ) : (
              <Eye size={14} aria-hidden="true" />
            )}
            {showEmails ? 'Hide emails' : 'Show emails'}
          </Button>
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
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRemoveTarget(method)}
                  disabled={!method.canRemove || removePending}
                  title={
                    method.canRemove
                      ? undefined
                      : 'Your only way to sign in can’t be removed'
                  }
                >
                  Remove
                </Button>
              }
            />
          ))}
          {canConnectGoogle && (
            <ConnectedAccountRow
              icon={<GoogleIcon />}
              providerName="Google"
              identifier={null}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleConnectGoogle()}
                  disabled={connectingGoogle}
                >
                  {connectingGoogle ? 'Opening Google…' : 'Connect'}
                </Button>
              }
            />
          )}
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

      <PasswordSettings me={me} />

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

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
        title={`Remove ${removeTarget?.providerName ?? 'this sign-in method'}?`}
        description="You won’t be able to sign in with it any more. If it’s how you signed in this time, you’ll be signed out."
        confirmLabel="Remove"
        destructive
        isPending={removePending}
        onConfirm={() => void handleRemove()}
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
