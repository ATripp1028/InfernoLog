// "What the log shows" — the glossary behind the Log page header button.
//
// User-facing language only. No event type is named here, and the internal-only
// index renormalisation does not appear at all: the user neither did it nor saw
// it, so there is nothing about it to explain.
//
// The button and the sheet are ONE component on purpose. When the open state
// lived on the page, toggling it re-rendered every feed row on the frame the
// slide started. That was half the stutter; the other half was the Radix
// Dialog's body scroll-lock relaying out the whole feed on the same frame,
// which is why this uses MotionSheet rather than the Radix Sheet.

import { useState } from 'react'
import {
  FileSpreadsheet,
  HelpCircle,
  ListOrdered,
  Pencil,
  Settings2,
  Sparkles,
  TrendingUp,
  Trophy,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import { MotionSheet } from '@/components/generic/motion-sheet'
import { Button } from '@/components/generic/button'
import { SectionLabel } from '@/components/inputs/SectionLabel'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { cn } from '@/lib/utils'
import type { FeedTone } from './feedContent'

interface GlossaryEntry {
  term: string
  meaning: string
  icon: LucideIcon
  tone: FeedTone
}

interface GlossarySection {
  heading: string
  entries: GlossaryEntry[]
}

// Each entry carries the icon and colour its rows actually use, so the glossary
// is a legend for the feed rather than a wall of prose beside it.
const GLOSSARY: GlossarySection[] = [
  {
    heading: 'Progress',
    entries: [
      {
        term: 'Beat a level',
        meaning: 'You logged a completion.',
        icon: Trophy,
        tone: 'success',
      },
      {
        term: 'Logged a run',
        meaning:
          'A run you wrote down — a new best, or any attempt worth keeping.',
        icon: TrendingUp,
        tone: 'neutral',
      },
      {
        term: 'Dropped a level',
        meaning: 'You stopped playing it. It stays in your list.',
        icon: Undo2,
        tone: 'danger',
      },
    ],
  },
  {
    heading: 'Ranking',
    entries: [
      {
        term: 'Placed',
        meaning: 'The level entered your ranking for the first time.',
        icon: ListOrdered,
        tone: 'ranking',
      },
      {
        term: 'Moved up or down',
        meaning: 'You dragged it to a new spot.',
        icon: TrendingUp,
        tone: 'ranking',
      },
      {
        term: 'Removed',
        meaning: 'It left your ranking. Its history stays here.',
        icon: Undo2,
        tone: 'ranking',
      },
      {
        term: 'An import replaced your ranking',
        meaning:
          'A spreadsheet import rewrote the whole order at once. Open it to see every level it moved.',
        icon: FileSpreadsheet,
        tone: 'ranking',
      },
      {
        term: 'Top 5, Top 10, Top 25…',
        meaning:
          'Shown when a level crosses one of those marks, in either direction. Only the tightest one is named — a jump from #30 to #4 says Top 5, not Top 25.',
        icon: Sparkles,
        tone: 'ranking',
      },
    ],
  },
  {
    heading: 'Edits',
    entries: [
      {
        term: 'Edited a log',
        meaning:
          "You changed something on a level's entry — a rating, a run detail, a note. Open it to see each field before and after.",
        icon: Pencil,
        tone: 'edit',
      },
      {
        term: '“Up 43 in your rating ranking”',
        meaning:
          "When a rating changes, the entry also shows the level's new average and where it moved in your rating ranking.",
        icon: Sparkles,
        tone: 'edit',
      },
    ],
  },
  {
    heading: 'Settings',
    entries: [
      {
        term: 'Changed your rating setup',
        meaning:
          'You switched rating modes, or changed your categories and their weights.',
        icon: Settings2,
        tone: 'settings',
      },
    ],
  },
]

// Mirrors the row icons' colours in FeedRow, so the legend and the feed agree.
const TONE_CLASSES: Record<FeedTone, string> = {
  ranking: 'bg-accent-dim text-accent-hover',
  edit: 'bg-info-dim text-info-soft',
  settings: 'bg-bg-subtle text-text-secondary',
  success: 'bg-success-dim text-success-soft',
  danger: 'bg-danger-dim text-danger-soft',
  neutral: 'bg-bg-subtle text-text-secondary',
}

/**
 * The "What the log shows" button and the glossary it opens.
 *
 * The sheet slides in from the right on desktop and up from the bottom on
 * mobile.
 */
export function GlossarySheet() {
  const [open, setOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 768px)')

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="shrink-0 gap-1.5 text-xs"
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden />
        What the log shows
      </Button>

      <MotionSheet
        open={open}
        onClose={() => setOpen(false)}
        side={isDesktop ? 'right' : 'bottom'}
        label="What the log shows"
      >
        <div className="overflow-y-auto px-4 py-4">
          <h2 className="text-base font-semibold text-text-primary">
            What the log shows
          </h2>
          <p className="mt-1 text-xs text-text-secondary">
            Everything you&rsquo;ve done, in the order you did it.
          </p>

          <div className="mt-4 flex flex-col gap-4">
            {GLOSSARY.map((section) => (
              <div key={section.heading}>
                <SectionLabel size="xs">{section.heading}</SectionLabel>
                <dl className="mt-1.5 flex flex-col gap-2.5">
                  {section.entries.map((entry) => (
                    <div key={entry.term} className="flex gap-2.5">
                      <span
                        className={cn(
                          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                          TONE_CLASSES[entry.tone]
                        )}
                      >
                        <entry.icon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <dt className="text-xs font-medium text-text-primary">
                          {entry.term}
                        </dt>
                        <dd className="text-xs text-text-secondary">
                          {entry.meaning}
                        </dd>
                      </div>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>

          <p className="mt-5 border-t border-border-subtle pt-3 text-[11px] text-text-tertiary">
            Collections aren&rsquo;t tracked — adding a level to Want to Beat or
            Favorites doesn&rsquo;t appear here.
          </p>
        </div>
      </MotionSheet>
    </>
  )
}
