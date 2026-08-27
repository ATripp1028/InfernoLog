import { AlertTriangle, Play, Tv, type LucideIcon } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/generic/tooltip'
import type { LogItem } from './types'
import { safeHref } from '@/lib/safeUrl'

/**
 * Row status icons: has video (links to the video), on stream, needs placement.
 * Uncertain date is shown next to the date instead.
 *
 * `interactive` (default) renders the video as a focusable link with tooltips —
 * used in the desktop row. The mobile card sets it false: the whole card is a
 * button, so it must not contain nested links/focusable controls. There it
 * renders plain titled icons and the video link lives in the detail pane.
 */
export function StatusIcons({
  item,
  interactive = true,
}: {
  item: LogItem
  interactive?: boolean
}) {
  const icons: React.ReactNode[] = []
  const video = item.entry?.videoUrl
  // A URL that isn't safe to put in an href still means "this run has a video",
  // so the row keeps the icon — it just loses the link rather than rendering an
  // anchor that does nothing when clicked.
  const videoHref = safeHref(video)

  if (video)
    icons.push(
      interactive && videoHref ? (
        <Tooltip key="video">
          <TooltipTrigger asChild>
            <a
              href={videoHref}
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
      ) : (
        <PlainIcon key="video" icon={Play} label="Has video" />
      )
    )
  if (item.entry?.onStream)
    icons.push(
      <StatusIcon
        key="stream"
        interactive={interactive}
        icon={Tv}
        label="On stream"
        className="text-primary"
      />
    )
  if (item.needsPlacement)
    icons.push(
      <StatusIcon
        key="placement"
        interactive={interactive}
        icon={AlertTriangle}
        label="Needs placement"
        className="text-warning"
      />
    )

  return <div className="flex items-center justify-center gap-1.5">{icons}</div>
}

function StatusIcon({
  icon: Icon,
  label,
  className,
  interactive,
}: {
  icon: LucideIcon
  label: string
  className?: string
  interactive: boolean
}) {
  if (!interactive)
    return <PlainIcon icon={Icon} label={label} className={className} />
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className ?? 'text-text-secondary'}>
          <Icon size={14} aria-label={label} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function PlainIcon({
  icon: Icon,
  label,
  className,
}: {
  icon: LucideIcon
  label: string
  className?: string | undefined
}) {
  return (
    <span title={label} className={className ?? 'text-text-secondary'}>
      <Icon size={14} aria-label={label} />
    </span>
  )
}
