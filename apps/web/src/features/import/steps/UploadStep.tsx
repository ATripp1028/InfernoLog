import { useId } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { downloadTemplate } from '../generateTemplate'
import type { DateFormat } from '../parseSpreadsheet'
import { DATE_OPTIONS } from '../importWizardModel'
import { useUploadStep } from './useUploadStep'

/**
 * Upload step: template download, the date-format selector the parser needs,
 * and the drop zone. Parsing and drag bookkeeping live in useUploadStep.
 */
export function UploadStep() {
  const fileId = useId()
  const {
    dateFormat,
    setDateFormat,
    error,
    parsing,
    isDragging,
    dropZone,
    handleFile,
  } = useUploadStep()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Import your completion history from a spreadsheet. Download the
            template first if you haven't already.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={downloadTemplate}
        >
          Download template
        </Button>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">Date format</label>
        <p className="text-xs text-muted-foreground mb-2">
          Select the date format used in your spreadsheet.
        </p>
        <Select
          value={dateFormat}
          onValueChange={(v) => setDateFormat(v as DateFormat)}
        >
          <SelectTrigger className="w-64">
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
      </div>

      <div>
        <label htmlFor={fileId} className="block text-sm font-medium mb-1.5">
          Spreadsheet file
        </label>
        <label
          htmlFor={fileId}
          {...dropZone}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed',
            'border-border bg-bg-surface p-10 cursor-pointer',
            'hover:border-primary hover:bg-bg-elevated transition-colors text-center',
            isDragging && 'border-primary bg-bg-elevated',
            parsing && 'pointer-events-none opacity-60'
          )}
        >
          <span className="text-2xl">📂</span>
          <span className="text-sm text-foreground font-medium">
            {parsing
              ? 'Parsing…'
              : isDragging
                ? 'Drop to upload'
                : 'Click to select or drag and drop'}
          </span>
          <span className="text-xs text-muted-foreground">
            .xlsx files only
          </span>
          <input
            id={fileId}
            type="file"
            accept=".xlsx,.xls"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleFile(f)
              e.target.value = ''
            }}
          />
        </label>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>
    </div>
  )
}
