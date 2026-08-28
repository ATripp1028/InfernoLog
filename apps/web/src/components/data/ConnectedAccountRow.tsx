import { ReactNode } from 'react'
import { Card } from '@/components/generic/card'

interface ConnectedAccountRowProps {
  icon: ReactNode
  providerName: string
  identifier: string | null
  status?: ReactNode
  action?: ReactNode
}

/**
 * A linked third-party account with its connect/disconnect action.
 */
export function ConnectedAccountRow({
  icon,
  providerName,
  identifier,
  status,
  action,
}: ConnectedAccountRowProps) {
  return (
    <Card className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-bg-elevated text-foreground">
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
    </Card>
  )
}
