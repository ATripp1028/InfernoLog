import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { SettingsSection, SettingRow } from '../components/SettingsSection'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import {
  DateFormatPreference,
  type GdVersion,
  useUpdateMe,
  type MeData,
} from '@/lib/api/me'
import { ImportWizard } from '@/features/import/ImportWizard'
import { useImportApi, useImportStatus } from '@/lib/api/import'
import { downloadExport } from '@/features/import/generateExport'

interface LoggingSectionProps {
  me: MeData
}

const DATE_OPTIONS: { value: DateFormatPreference; label: string }[] = [
  { value: 'MDY', label: 'MM/DD/YYYY' },
  { value: 'DMY', label: 'DD/MM/YYYY' },
  { value: 'ISO', label: 'YYYY-MM-DD' },
  { value: 'YMD', label: 'YYYY/MM/DD' },
]

// 60 is the Geometry Dash floor — must stay in sync with MIN_FPS in
// @infernolog/core's UpdateMeSchema.
const MIN_FPS = 60

// The four logging-preference rows (date format / % version / FPS / highlight
// toggle) — extracted so the onboarding wizard's Logging step can reuse them
// exactly, without Settings-only rows (Import/Export) that don't belong there
// (Import is its own onboarding step; Export doesn't apply pre-onboarding).
export function LoggingPreferencesFields({ me }: LoggingSectionProps) {
  const update = useUpdateMe()

  const handleToggle = async (field: 'showHighlightUrl', next: boolean) => {
    try {
      await update.mutateAsync({ [field]: next })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const handleChange = async (value: string) => {
    try {
      await update.mutateAsync({
        dateFormatPreference: value as DateFormatPreference,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const handlePercentageVersionChange = async (value: GdVersion) => {
    try {
      await update.mutateAsync({ defaultPercentageVersion: value })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  // Free-form string while editing; parse/clamp/commit on blur so the user can
  // clear the field and type. Synced back from the server value when idle.
  const [fpsDraft, setFpsDraft] = useState(String(me.defaultFps))
  useEffect(() => {
    setFpsDraft(String(me.defaultFps))
  }, [me.defaultFps])

  const commitFps = async () => {
    const parsed = Math.floor(Number(fpsDraft))
    if (!Number.isFinite(parsed) || parsed < MIN_FPS) {
      setFpsDraft(String(me.defaultFps))
      toast.error(`FPS must be a whole number of at least ${MIN_FPS}`)
      return
    }
    setFpsDraft(String(parsed))
    if (parsed === me.defaultFps) return
    try {
      await update.mutateAsync({ defaultFps: parsed })
    } catch (err) {
      setFpsDraft(String(me.defaultFps))
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  return (
    <>
      <SettingRow
        label="Date format"
        description="Used when displaying dates throughout the app and as the default format when importing spreadsheets."
        control={
          <Select
            value={me.dateFormatPreference}
            onValueChange={(v) => void handleChange(v)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <SettingRow
        label="Default % version"
        description="Which GD version's percentage system to pre-select when logging. 2.1 uses distance to the endwall; 2.2 uses time relative to the verification attempt."
        control={
          <Select
            value={me.defaultPercentageVersion}
            onValueChange={(v) =>
              void handlePercentageVersionChange(v as GdVersion)
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TWO_TWO">2.2 (time-based)</SelectItem>
              <SelectItem value="TWO_ONE">2.1 (distance-based)</SelectItem>
            </SelectContent>
          </Select>
        }
      />
      <SettingRow
        label="Default FPS"
        description="Pre-filled into the Log Level form. Must be at least 60."
        control={
          <Input
            type="number"
            inputMode="numeric"
            min={MIN_FPS}
            step={1}
            className="w-44"
            aria-label="Default FPS"
            value={fpsDraft}
            onChange={(e) => setFpsDraft(e.target.value)}
            onBlur={() => void commitFps()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        }
      />
      <SettingRow
        label="Show Highlight URL field"
        description="Adds a Highlight URL field to the logging and edit workflows. Useful for content creators who maintain highlight reels."
        control={
          <Switch
            checked={me.showHighlightUrl}
            onCheckedChange={(v) => void handleToggle('showHighlightUrl', v)}
          />
        }
      />
    </>
  )
}

export function LoggingSection({ me }: LoggingSectionProps) {
  const [importOpen, setImportOpen] = useState(false)
  const { getExport } = useImportApi()
  const importStatus = useImportStatus()

  const handleExport = async () => {
    try {
      const exportData = await getExport()
      downloadExport(exportData, me.dateFormatPreference)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export')
    }
  }

  const job = importStatus.data
  const hasUnresolvedFlag = job?.flaggedRows.some((r) => !r.resolved) ?? false
  const importStatusLine =
    job?.status === 'running'
      ? `Importing… ${job.processedRows}/${job.totalRows} rows`
      : job?.status === 'completed' && hasUnresolvedFlag
        ? `${job.flaggedRows.filter((r) => !r.resolved).length} row${job.flaggedRows.filter((r) => !r.resolved).length !== 1 ? 's' : ''} need review`
        : null

  return (
    <>
      <Dialog.Root open={importOpen} onOpenChange={setImportOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
          <Dialog.Content
            aria-describedby="import-wizard-desc"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) setImportOpen(false)
            }}
            className="fixed inset-0 z-50 flex items-center justify-center focus:outline-none md:p-8"
          >
            <div
              className={cn(
                'flex h-full w-full flex-col overflow-y-auto bg-[var(--color-bg-surface)] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.6)]',
                'md:h-auto md:max-h-[calc(100vh-4rem)] md:w-[760px] md:max-w-[calc(100vw-2rem)] md:rounded-card md:border md:border-[var(--color-border-subtle)]'
              )}
            >
              <Dialog.Title className="sr-only">
                Import spreadsheet
              </Dialog.Title>
              <Dialog.Description id="import-wizard-desc" className="sr-only">
                Three-step wizard to import your Geometry Dash completion
                history from a spreadsheet.
              </Dialog.Description>
              <ImportWizard me={me} onClose={() => setImportOpen(false)} />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <SettingsSection title="Logging">
        <LoggingPreferencesFields me={me} />
        <SettingRow
          label="Import from spreadsheet"
          description={
            <>
              Bring your existing completion history into InfernoLog from an
              xlsx spreadsheet.
              {importStatusLine && (
                <span className="mt-1 block font-medium text-amber-600 dark:text-amber-400">
                  {importStatusLine}
                </span>
              )}
            </>
          }
          control={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
            >
              Import
            </Button>
          }
        />
        <SettingRow
          label="Export to spreadsheet"
          description="Download your completion history as an xlsx spreadsheet. Useful for backups or sharing with others."
          control={
            <Button variant="outline" size="sm" onClick={handleExport}>
              Export
            </Button>
          }
        />
      </SettingsSection>
    </>
  )
}
