import { AlertTriangle, HelpCircle, Play, Tv } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ListItem } from './types'

// Row status icons: has video, on stream, uncertain date, needs placement.
export function StatusIcons({ item }: { item: ListItem }) {
  const icons: React.ReactNode[] = []

  if (item.entry?.videoUrl)
    icons.push(<Icon key="video" label="Has video" icon={Play} />)
  if (item.entry?.onStream)
    icons.push(
      <Icon key="stream" label="On stream" icon={Tv} className="text-primary" />
    )
  if (item.entry?.dateUncertain)
    icons.push(
      <Icon
        key="uncertain"
        label="Uncertain date"
        icon={HelpCircle}
        className="text-warning"
      />
    )
  if (item.needsPlacement)
    icons.push(
      <Icon
        key="placement"
        label="Needs placement"
        icon={AlertTriangle}
        className="text-warning"
      />
    )

  return <div className="flex items-center justify-center gap-1.5">{icons}</div>
}

function Icon({
  icon: IconComp,
  label,
  className,
}: {
  icon: typeof Play
  label: string
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className ?? 'text-text-secondary'}>
          <IconComp size={14} aria-label={label} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
