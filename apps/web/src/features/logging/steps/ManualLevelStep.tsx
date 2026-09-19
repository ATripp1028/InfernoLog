import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { ManualLevelDifficulty } from '@/lib/api/wireEnums'
import { Button } from '@/components/generic/button'
import { Input } from '@/components/generic/input'
import { Card } from '@/components/generic/card'
import { Segmented } from '@/components/generic/segmented'
import { toast } from '@/components/generic/sonner'
import { ApiError } from '@/lib/api/client'
import { useCreateManualLevel } from '@/lib/api/logging'
import { useFlowBusy, useLoggingFlow } from '@/context/LoggingFlowContext'
import { FieldHint, FieldLabel, StepBody, StepFooter } from '../components'

// The stored value IS the in-game difficulty string. Only the five demon tiers
// and "Unrated" are offered: a rated non-demon is never cached, so there is
// nothing else this form could legitimately create. The API derives isDemon and
// isRated from whichever of these the user picks.
const DEMON_OPTIONS: ReadonlyArray<{
  value: ManualLevelDifficulty
  label: string
}> = [
  { value: 'Easy Demon', label: 'Easy' },
  { value: 'Medium Demon', label: 'Medium' },
  { value: 'Hard Demon', label: 'Hard' },
  { value: 'Insane Demon', label: 'Insane' },
  { value: 'Extreme Demon', label: 'Extreme' },
]

/**
 * Hand-enters a level when RobTop can't be reached or has no such id. Stored unverified until a sync confirms it.
 */
export function ManualLevelStep() {
  const { manualLevelId, setStep, applyManualLevel } = useLoggingFlow()
  const createLevel = useCreateManualLevel()
  useFlowBusy(createLevel.isPending)

  const [name, setName] = useState('')
  const [creator, setCreator] = useState('')
  const [difficulty, setDifficulty] =
    useState<ManualLevelDifficulty>('Extreme Demon')
  const [songName, setSongName] = useState('')
  const [songAuthor, setSongAuthor] = useState('')
  const [length, setLength] = useState('')

  const canSubmit = name.trim().length > 0 && creator.trim().length > 0

  async function submit() {
    if (!manualLevelId || !canSubmit) return
    try {
      const level = await createLevel.mutateAsync({
        inGameId: manualLevelId,
        name: name.trim(),
        creator: creator.trim(),
        difficulty,
        songName: songName.trim() || null,
        songAuthor: songAuthor.trim() || null,
        length: length.trim() || null,
      })
      applyManualLevel(level)
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not save level details'
      )
    }
  }

  return (
    <>
      <StepBody>
        <Card variant="accent" className="flex gap-3 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-accent" />
          <div>
            <p className="text-sm font-semibold text-text-primary">
              Couldn&apos;t reach the Geometry Dash servers
            </p>
            <p className="text-sm text-text-secondary">
              Enter the level&apos;s details and we&apos;ll verify and fill in
              anything missing automatically once they&apos;re back.
            </p>
          </div>
        </Card>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <FieldLabel className="mb-0">Level ID</FieldLabel>
            <span className="text-xs text-text-tertiary">from your entry</span>
          </div>
          <Input value={manualLevelId ?? ''} disabled className="font-mono" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="m-name">Level name</FieldLabel>
            <Input
              id="m-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="m-creator">Creator</FieldLabel>
            <Input
              id="m-creator"
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
            />
          </div>
        </div>

        <div>
          <FieldLabel hint="Sets the in-game rating since we couldn't fetch it.">
            In-game difficulty
          </FieldLabel>
          <Segmented
            options={DEMON_OPTIONS}
            value={difficulty === 'Unrated' ? null : difficulty}
            onChange={(v) => setDifficulty(v as ManualLevelDifficulty)}
          />
          <FieldHint>
            Sets the in-game rating since we couldn&apos;t fetch it. Stored as
            unverified until it syncs.
          </FieldHint>

          {/* The unrated path — a level GD hasn't rated yet, which is most of
              what reaches this form: a brand-new level is exactly the case
              RobTop's servers can't answer for. */}
          <label className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={difficulty === 'Unrated'}
              onChange={(e) =>
                setDifficulty(e.target.checked ? 'Unrated' : 'Extreme Demon')
              }
            />
            Not rated yet
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="m-song">Song name</FieldLabel>
            <Input
              id="m-song"
              value={songName}
              onChange={(e) => setSongName(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="m-songauthor">Song author</FieldLabel>
            <Input
              id="m-songauthor"
              value={songAuthor}
              onChange={(e) => setSongAuthor(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="m-length">Length</FieldLabel>
            <Input
              id="m-length"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              placeholder="XL"
            />
          </div>
        </div>
      </StepBody>

      <StepFooter>
        <Button variant="outline" onClick={() => setStep('find')}>
          Back
        </Button>
        <Button onClick={submit} disabled={!canSubmit || createLevel.isPending}>
          {createLevel.isPending ? 'Saving…' : 'Continue'}
        </Button>
      </StepFooter>
    </>
  )
}
