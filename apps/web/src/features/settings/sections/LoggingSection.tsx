import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  SettingsSection,
  SettingRow,
} from '@/components/generic/settings-section'
import { LoggingPreferencesFields } from '@/components/inputs/LoggingPreferencesFields'
import { Button } from '@/components/generic/button'
import { toast } from '@/components/generic/sonner'
import { cn } from '@/lib/utils'
import type { MeData } from '@/lib/api/me'
import { ImportWizard, downloadExport } from '@/features/import'
import { useImportApi, useImportStatus } from '@/lib/api/import'

interface LoggingSectionProps {
  me: MeData
}

/**
 * Logging defaults (FPS, device, percentage version) plus the import/export entry points.
 */
export function LoggingSection({ me }: LoggingSectionProps) {
  const [importOpen, setImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const { getExport } = useImportApi()
  const importStatus = useImportStatus()

  const handleExport = async () => {
    setExporting(true)
    try {
      const exportData = await getExport()
      downloadExport(exportData, me.dateFormatPreference)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export')
    } finally {
      setExporting(false)
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
                'flex h-full w-full flex-col overflow-y-auto bg-bg-surface p-6 shadow-[0_24px_64px_rgba(0,0,0,0.6)]',
                'md:h-auto md:max-h-[calc(100vh-4rem)] md:w-[760px] md:max-w-[calc(100vw-2rem)] md:rounded-card md:border md:border-border-subtle'
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
                <span className="mt-1 block font-medium text-warning-soft">
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              {exporting ? 'Exporting…' : 'Export'}
            </Button>
          }
        />
      </SettingsSection>
    </>
  )
}
