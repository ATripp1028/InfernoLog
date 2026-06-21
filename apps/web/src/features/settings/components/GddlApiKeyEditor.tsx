import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/sonner'
import {
  useRemoveGddlApiKey,
  useSetGddlApiKey,
  type MeData,
} from '@/lib/api/me'
import { ConnectedAccountRow } from './ConnectedAccountRow'

interface GddlApiKeyEditorProps {
  me: MeData
}

// GDDL connection, presented like the Google/Discord rows. Connecting requires
// pasting an API key (verified server-side); the key is write-only and never
// sent back. When connected we show the confirmed GDDL username.
export function GddlApiKeyEditor({ me }: GddlApiKeyEditorProps) {
  const setKey = useSetGddlApiKey()
  const removeKey = useRemoveGddlApiKey()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')

  const save = async () => {
    const trimmed = value.trim()
    if (!trimmed) {
      toast.error('Enter an API key')
      return
    }
    try {
      const { gddlName } = await setKey.mutateAsync(trimmed)
      setValue('')
      setEditing(false)
      toast.success(`Successfully connected to GDDL user ${gddlName}!`)
    } catch (err) {
      // The API rejects an invalid key with a 400 and a descriptive message,
      // which surfaces here as err.message.
      toast.error(err instanceof Error ? err.message : 'Failed to save API key')
    }
  }

  const disconnect = async () => {
    try {
      await removeKey.mutateAsync()
      setValue('')
      setEditing(false)
      toast.success('GDDL account disconnected')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disconnect')
    }
  }

  return (
    <div className="space-y-2">
      <ConnectedAccountRow
        icon={
          <img
            src="https://gdladder.com/favicon.ico"
            alt=""
            aria-hidden="true"
            className="h-5 w-5"
          />
        }
        providerName="GDDL"
        identifier={me.gddlUsername ? `GDDL user ${me.gddlUsername}` : null}
        action={
          editing ? null : me.hasGddlApiKey ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void disconnect()}
              disabled={removeKey.isPending}
            >
              {removeKey.isPending ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          ) : (
            <Button size="sm" onClick={() => setEditing(true)}>
              Connect
            </Button>
          )
        }
      />
      {editing && (
        <div className="flex gap-2">
          <Input
            type="password"
            autoComplete="off"
            placeholder="Paste your GDDL API key"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
            }}
          />
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={setKey.isPending}
          >
            {setKey.isPending ? 'Connecting…' : 'Save'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setValue('')
              setEditing(false)
            }}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}
