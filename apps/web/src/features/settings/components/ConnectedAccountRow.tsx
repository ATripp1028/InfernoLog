import { ReactNode } from 'react'

interface ConnectedAccountRowProps {
  icon: ReactNode
  providerName: string
  identifier: string | null
  status?: ReactNode
  action?: ReactNode
}

export function ConnectedAccountRow({
  icon,
  providerName,
  identifier,
  status,
  action,
}: ConnectedAccountRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-[var(--color-border-subtle)] bg-card px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-[var(--color-bg-elevated)] text-foreground">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">
            {providerName}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {identifier ?? 'Not connected'}
          </div>
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        {status}
        {action}
      </div>
    </div>
  )
}
