import { ReactNode } from 'react'
import { Separator } from '@/components/ui/separator'

interface SettingsSectionProps {
  title: string
  description?: string
  children: ReactNode
  showSeparator?: boolean
}

export function SettingsSection({
  title,
  description,
  children,
  showSeparator = true,
}: SettingsSectionProps) {
  return (
    <>
      <section className="py-8 first:pt-0">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="space-y-6">{children}</div>
      </section>
      {showSeparator && <Separator />}
    </>
  )
}

interface SettingRowProps {
  label: string
  description?: ReactNode
  control: ReactNode
  error?: string | null
}

/* Row layout for a single setting: label + description on the left, control on
   the right. Used for switches and selects where the control is compact. */
export function SettingRow({
  label,
  description,
  control,
  error,
}: SettingRowProps) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex-1 space-y-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      </div>
      <div className="flex-shrink-0">{control}</div>
    </div>
  )
}

interface SettingStackProps {
  label: string
  description?: string
  children: ReactNode
  error?: string | null
}

/* Vertical layout for a setting where the control is wider (drag list,
   category editor, segmented control). */
export function SettingStack({
  label,
  description,
  children,
  error,
}: SettingStackProps) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  )
}
