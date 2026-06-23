import { AlertTriangle, Play, Tv } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ListItem } from './types'

// Row status icons: has video (links to the video), on stream, needs placement.
// Uncertain date is shown next to the date instead.
export function StatusIcons({ item }: { item: ListItem }) {
  const icons: React.ReactNode[] = []

  if (item.entry?.videoUrl)
    icons.push(
      <Tooltip key="video">
        <TooltipTrigger asChild>
          <a
            href={item.entry.videoUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-text-secondary hover:text-primary"
          >
            <Play size={14} aria-label="Watch completion video" />
          </a>
        </TooltipTrigger>
        <TooltipContent>Watch video</TooltipContent>
      </Tooltip>
    )
  if (item.entry?.onStream)
    icons.push(
      <Icon key="stream" label="On stream" icon={Tv} className="text-primary" />
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
