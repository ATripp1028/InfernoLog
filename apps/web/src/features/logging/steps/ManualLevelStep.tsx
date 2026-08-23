import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { NON_DEMON_STAR_TIERS, starsToFace } from '@infernolog/core'
import { Button } from '@/components/generic/button'
import { Input } from '@/components/generic/input'
import { Card } from '@/components/generic/card'
import { Switch } from '@/components/generic/switch'
import { Segmented } from '@/components/generic/segmented'
import { toast } from '@/components/generic/sonner'
import { ApiError } from '@/lib/api/client'
import { useCreateManualLevel } from '@/lib/api/logging'
import { useFlowBusy, useLoggingFlow } from '../LoggingFlowProvider'
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
// The VALUE is the star count, not the face, because the face doesn't determine
// it: Hard is 4 or 5 stars, Harder 6 or 7, Insane 8 or 9. The count is what the
// API stores as canonical, so it's what the user picks; the face is shown
// beside it because that's the other half of how players say it ("a 5 star
// Hard"). Adjacent same-face options are the bands, not duplicates.
const NON_DEMON_OPTIONS: ReadonlyArray<{ value: string; label: string }> =
  NON_DEMON_STAR_TIERS.map(({ stars, face }) => ({
    value: String(stars),
    label: `${stars}★ ${face}`,
  }))

/**
 * Hand-enters a level when RobTop can't be reached or has no such id. Stored unverified until a sync confirms it.
 */
export function ManualLevelStep() {
  const { manualLevelId, setStep, applyManualLevel } = useLoggingFlow()
  const createLevel = useCreateManualLevel()
  useFlowBusy(createLevel.isPending)

  const [name, setName] = useState('')
  const [creator, setCreator] = useState('')
  const [difficulty, setDifficulty] = useState<string>('Extreme Demon')
  // Only set on the non-demon path; the demon path clears it, since every demon
  // is 10 stars and the count would say nothing the tier doesn't.
  const [stars, setStars] = useState<number | null>(null)
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
        stars: isDemon ? null : stars,
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
            onChange={(v) => {
              setDifficulty(v)
              setStars(null)
            }}
          />
          <FieldHint>
            Sets the in-game rating since we couldn&apos;t fetch it. Stored as
            unverified until it syncs.
          </FieldHint>

          {/* Non-demon path — secondary, since most logs here are demons. */}
          <div className="mt-3 rounded-md border border-border-subtle bg-bg-surface/40 p-3">
            <p className="mb-2 text-xs text-text-tertiary">
              Not a demon? Pick its star rating instead.
            </p>
            <Segmented
              options={NON_DEMON_OPTIONS}
              value={stars == null ? null : String(stars)}
              onChange={(v) => {
                const n = Number(v)
                setStars(n)
                // Non-null for every option: they're built from the same bands.
                setDifficulty(starsToFace(n)!)
              }}
              size="sm"
              fill={false}
            />
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
