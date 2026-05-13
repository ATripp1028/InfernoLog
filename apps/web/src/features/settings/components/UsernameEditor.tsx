import { useEffect, useRef, useState } from 'react'
import { toast } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ApiError,
  checkUsernameAvailable,
  useUpdateUsername,
  type MeData,
} from '@/lib/api/me'
import { formatDate } from '@/lib/dateFormat'

const COOLDOWN_DAYS = 30
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000

interface UsernameEditorProps {
  me: MeData
}

export function UsernameEditor({ me }: UsernameEditorProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(me.username)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null
  )
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const update = useUpdateUsername()

  const lockedUntil = computeCooldownEnd(me.usernameChangedAt)
  const isLocked = lockedUntil !== null

  useEffect(() => {
    setValue(me.username)
  }, [me.username])

  useEffect(() => {
    if (!editing || value === me.username) {
      setAvailabilityError(null)
      return
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(async () => {
      const res = await checkUsernameAvailable(value)
      if (!res.available) {
        setAvailabilityError(res.error ?? 'Username is already taken')
      } else {
        setAvailabilityError(null)
      }
    }, 300)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [value, editing, me.username])

  const handleSave = async () => {
    if (value === me.username) {
      setEditing(false)
      return
    }
    if (!validateUsername(value, setValidationError)) return
    if (availabilityError) return

    try {
      await update.mutateAsync(value)
      toast.success('Username updated')
      setEditing(false)
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        const body = err.body as { nextAllowedAt?: string } | null
        const nextAllowed = body?.nextAllowedAt
        const msg = nextAllowed
          ? `You can change your username again on ${formatDate(
              nextAllowed,
              me.dateFormatPreference
            )}.`
          : 'Username change is on cooldown.'
        setValidationError(msg)
        toast.error(msg)
        return
      }
      const msg =
        err instanceof Error ? err.message : 'Failed to update username'
      setValidationError(msg)
      toast.error(msg)
    }
  }

  const handleCancel = () => {
    setValue(me.username)
    setEditing(false)
    setValidationError(null)
    setAvailabilityError(null)
  }

  if (isLocked) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="text-base text-foreground">{me.username}</div>
        </div>
        <p className="text-xs text-muted-foreground">
          You can change your username again on{' '}
          {formatDate(lockedUntil, me.dateFormatPreference)}.
        </p>
      </div>
    )
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <div className="text-base text-foreground">{me.username}</div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setValidationError(null)
            setAvailabilityError(null)
            setEditing(true)
          }}
        >
          Edit
        </Button>
      </div>
    )
  }

  const error = validationError ?? availabilityError

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setValidationError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSave()
            if (e.key === 'Escape') handleCancel()
          }}
          className="max-w-xs"
          autoFocus
          disabled={update.isPending}
        />
        <Button
          onClick={() => void handleSave()}
          disabled={update.isPending || !!error || value === me.username}
          size="sm"
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button
          onClick={handleCancel}
          variant="ghost"
          size="sm"
          disabled={update.isPending}
        >
          Cancel
        </Button>
      </div>
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      <p className="text-xs text-muted-foreground">
        2–32 characters, letters / numbers / underscores / hyphens. Username
        changes are locked for {COOLDOWN_DAYS} days after each change.
      </p>
    </div>
  )
}

function validateUsername(
  value: string,
  setError: (s: string | null) => void
): boolean {
  if (value.length < 2) {
    setError('Username must be at least 2 characters')
    return false
  }
  if (value.length > 32) {
    setError('Username must be at most 32 characters')
    return false
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    setError(
      'Username can only contain letters, numbers, underscores, and hyphens'
    )
    return false
  }
  return true
}

function computeCooldownEnd(usernameChangedAt: string | null): Date | null {
  if (!usernameChangedAt) return null
  const changed = new Date(usernameChangedAt).getTime()
  const end = changed + COOLDOWN_MS
  if (Date.now() >= end) return null
  return new Date(end)
}
