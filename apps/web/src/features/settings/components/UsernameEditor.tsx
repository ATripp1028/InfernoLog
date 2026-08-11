import { useEffect, useRef, useState } from 'react'
import { toast } from '@/components/generic/sonner'
import { Button } from '@/components/generic/button'
import { Input } from '@/components/generic/input'
import {
  ApiError,
  checkUsernameAvailable,
  useUpdateUsername,
  type MeData,
} from '@/lib/api/me'
import { formatDate } from '@/lib/dateFormat'
import { COOLDOWN_DAYS, cooldownEnd, usernameError } from '../usernameRules'

interface UsernameEditorProps {
  me: MeData
  // Onboarding opens straight into the input (the seeded placeholder
  // username needs changing immediately) instead of Settings' collapsed
  // read-only view behind an Edit button.
  startInEditing?: boolean
  // Called after a successful save — lets the onboarding wizard advance to
  // its next step. Settings' usage simply ignores it.
  onSaved?: () => void
}

/**
 * Username field with availability checking and the rename-cooldown message.
 */
export function UsernameEditor({
  me,
  startInEditing,
  onSaved,
}: UsernameEditorProps) {
  const [editing, setEditing] = useState(startInEditing ?? false)
  // Onboarding starts the box empty rather than prefilled with the seeded
  // placeholder (`<email-localpart>_<hex>`) — that placeholder embeds part
  // of the user's email, which is a privacy leak if it's ever visible (e.g.
  // on a stream) even for the moment before they type a real one.
  const [value, setValue] = useState(startInEditing ? '' : me.username)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null
  )
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const update = useUpdateUsername()

  const lockedUntil = cooldownEnd(me.usernameChangedAt)
  const isLocked = lockedUntil !== null

  // Only re-sync from the server value while not actively editing (Cancel
  // and a successful Save already set `value` explicitly) — otherwise this
  // would immediately overwrite onboarding's intentionally-empty start value
  // with the placeholder username on mount.
  useEffect(() => {
    if (editing) return
    setValue(me.username)
  }, [me.username, editing])

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal

    if (!editing || value === me.username) {
      setAvailabilityError(null)
      return
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(async () => {
      try {
        const res = await checkUsernameAvailable(value, signal)
        if (!res.available) {
          setAvailabilityError(res.error ?? 'Username is already taken')
        } else {
          setAvailabilityError(null)
        }
      } catch (err) {
        // A newer keystroke superseded this check (cleanup below calls
        // controller.abort()) — that's the expected flow while typing, not a
        // failure, so it shouldn't surface as an error. Aborted fetches throw
        // a DOMException, which isn't an Error subclass, so check by name.
        if ((err as { name?: string } | null)?.name === 'AbortError') return
        const msg =
          err instanceof Error ? err.message : 'Failed to check username'
        setAvailabilityError(msg)
      }
    }, 300)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      controller.abort()
    }
  }, [value, editing, me.username])

  const handleSave = async () => {
    if (value === me.username) {
      setEditing(false)
      return
    }
    const problem = usernameError(value)
    if (problem) {
      setValidationError(problem)
      return
    }
    if (availabilityError) return

    try {
      await update.mutateAsync(value)
      setEditing(false)
      onSaved?.()
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
            // Cancelling would fall back to the read-only view, which shows
            // the placeholder username in plain text — not offered during
            // onboarding (see the Cancel button below).
            if (e.key === 'Escape' && !startInEditing) handleCancel()
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
        {!startInEditing && (
          <Button
            onClick={handleCancel}
            variant="ghost"
            size="sm"
            disabled={update.isPending}
          >
            Cancel
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <p className="text-xs text-muted-foreground">
        2–32 characters, letters / numbers / underscores / hyphens. Username
        changes are locked for {COOLDOWN_DAYS} days after each change.
      </p>
    </div>
  )
}
