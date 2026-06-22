import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Segmented } from '@/components/ui/segmented'
import { toast } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import { ApiError } from '@/lib/api/client'
import { useCreateManualLevel } from '@/lib/api/logging'
import { useLoggingFlow } from '../LoggingFlowProvider'
import { FieldHint, FieldLabel, StepBody, StepFooter } from '../components'

// Demon tiers are the primary case (the app is demon-focused). The stored value
// IS the in-game difficulty string; demon values set isDemon=true.
const DEMON_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'Easy Demon', label: 'Easy' },
  { value: 'Medium Demon', label: 'Medium' },
  { value: 'Hard Demon', label: 'Hard' },
  { value: 'Insane Demon', label: 'Insane' },
  { value: 'Extreme Demon', label: 'Extreme' },
]
// Non-demon difficulties — secondary; for the occasional non-demon log.
const NON_DEMON_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'Auto', label: 'Auto' },
  { value: 'Easy', label: 'Easy' },
  { value: 'Normal', label: 'Normal' },
  { value: 'Hard', label: 'Hard' },
  { value: 'Harder', label: 'Harder' },
  { value: 'Insane', label: 'Insane' },
]

export function ManualLevelStep() {
  const { manualLevelId, setStep, applyManualLevel } = useLoggingFlow()
  const createLevel = useCreateManualLevel()

  const [name, setName] = useState('')
  const [creator, setCreator] = useState('')
  const [difficulty, setDifficulty] = useState<string>('Extreme Demon')
  const [rated, setRated] = useState(true)
  const [songName, setSongName] = useState('')
  const [songAuthor, setSongAuthor] = useState('')
  const [length, setLength] = useState('')

  const isDemon = difficulty.includes('Demon')
  // Demons (and autos) are only ever assigned to rated levels.
  const effectiveRated = isDemon || difficulty === 'Auto' || rated
  const canSubmit = name.trim().length > 0 && creator.trim().length > 0

  async function submit() {
    if (!manualLevelId || !canSubmit) return
    try {
      const level = await createLevel.mutateAsync({
        inGameId: manualLevelId,
        name: name.trim(),
        creator: creator.trim(),
        difficulty,
        isDemon,
        isRated: effectiveRated,
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
            value={isDemon ? difficulty : null}
            onChange={setDifficulty}
          />
          <FieldHint>
            Sets the in-game rating since we couldn&apos;t fetch it. Stored as
            unverified until it syncs.
          </FieldHint>

          {/* Non-demon path — secondary, since most logs here are demons. */}
          <div className="mt-3 rounded-md border border-border-subtle bg-bg-surface/40 p-3">
            <p className="mb-2 text-xs text-text-tertiary">
              Not a demon? Pick its difficulty instead.
            </p>
            <div className="flex flex-wrap gap-2">
              {NON_DEMON_OPTIONS.map((opt) => {
                const active = difficulty === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setDifficulty(opt.value)}
                    className={cn(
                      'h-8 rounded-md border px-3 text-xs font-medium transition-colors',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-bg-surface/60 text-text-secondary hover:text-text-primary'
                    )}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
              <Switch
                checked={effectiveRated}
                disabled={isDemon || difficulty === 'Auto'}
                onCheckedChange={setRated}
              />
              Rated (has stars)
            </label>
          </div>
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
