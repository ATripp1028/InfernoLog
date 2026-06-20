import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { toast } from '@/components/ui/sonner'
import { ApiError } from '@/lib/api/client'
import { useCreateManualLevel } from '@/lib/api/logging'
import { useLoggingFlow } from '../LoggingFlowProvider'
import { FieldHint, FieldLabel, StepBody, StepFooter } from '../components'

// Manual in-game difficulty options. "Not a demon" maps to a non-demon level;
// the rest are demon tiers and set isDemon=true.
const DIFFICULTY_OPTIONS = [
  { value: 'Not a demon', label: 'Not a demon' },
  { value: 'Easy Demon', label: 'Easy' },
  { value: 'Medium Demon', label: 'Medium' },
  { value: 'Hard Demon', label: 'Hard' },
  { value: 'Insane Demon', label: 'Insane' },
  { value: 'Extreme Demon', label: 'Extreme' },
] as const

export function ManualLevelStep() {
  const { manualLevelId, setStep, applyManualLevel } = useLoggingFlow()
  const createLevel = useCreateManualLevel()

  const [name, setName] = useState('')
  const [creator, setCreator] = useState('')
  const [difficulty, setDifficulty] =
    useState<(typeof DIFFICULTY_OPTIONS)[number]['value']>('Extreme Demon')
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
        isDemon: difficulty !== 'Not a demon',
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
              Couldn&apos;t reach GDBrowser
            </p>
            <p className="text-sm text-text-secondary">
              Enter the level&apos;s details and we&apos;ll verify and fill in
              anything missing automatically once GDBrowser is back.
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

        <div className="grid grid-cols-2 gap-4">
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
          <FieldLabel hint="Sets the in-game rating since GDBrowser couldn't provide it.">
            In-game difficulty
          </FieldLabel>
          <Segmented
            options={DIFFICULTY_OPTIONS}
            value={difficulty}
            onChange={setDifficulty}
          />
          <FieldHint>
            Sets the in-game rating since GDBrowser couldn&apos;t provide it.
            Stored as unverified until it syncs.
          </FieldHint>
        </div>

        <div className="grid grid-cols-2 gap-4">
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

        <div className="grid grid-cols-2 gap-4">
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
