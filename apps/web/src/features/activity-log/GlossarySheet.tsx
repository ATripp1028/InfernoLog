// "What the log shows" — the glossary behind the Log page header button.
//
// User-facing language only. No event type is named here, and the internal-only
// index renormalisation does not appear at all: the user neither did it nor saw
// it, so there is nothing about it to explain.

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/generic/sheet'
import { SectionLabel } from '@/components/inputs/SectionLabel'
import { useMediaQuery } from '@/lib/useMediaQuery'

interface GlossaryEntry {
  term: string
  meaning: string
}

interface GlossarySection {
  heading: string
  entries: GlossaryEntry[]
}

const GLOSSARY: GlossarySection[] = [
  {
    heading: 'Progress',
    entries: [
      { term: 'Beat a level', meaning: 'You logged a completion.' },
      {
        term: 'Logged a run',
        meaning:
          'A run you wrote down — a new best, or any attempt worth keeping.',
      },
      {
        term: 'Dropped a level',
        meaning: 'You stopped playing it. It stays in your list.',
      },
    ],
  },
  {
    heading: 'Ranking',
    entries: [
      {
        term: 'Placed',
        meaning: 'The level entered your ranking for the first time.',
      },
      { term: 'Moved up or down', meaning: 'You dragged it to a new spot.' },
      {
        term: 'Removed',
        meaning: 'It left your ranking. Its history stays here.',
      },
      {
        term: 'An import replaced your ranking',
        meaning:
          'A spreadsheet import rewrote the whole order at once. Open it to see every level it moved.',
      },
      {
        term: 'Top 5, Top 10, Top 25…',
        meaning:
          'Shown when a level crosses one of those marks, in either direction. Only the tightest one is named — a jump from #30 to #4 says Top 5, not Top 25.',
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
      },
      {
        term: 'Up 43 in your rating ranking',
        meaning:
          "When a rating changes, the entry also shows the level's new average and where it moved in your rating ranking.",
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
      },
    ],
  },
]

/**
 * The glossary sheet — right side on desktop, bottom on mobile.
 *
 * @param onOpenChange - Controlled by the page rather than by a trigger inside
 * this component, because the button that opens it lives in the page header.
 */
export function GlossarySheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktop ? 'right' : 'bottom'}
        className="overflow-y-auto"
      >
        <div className="px-4 py-4">
          <SheetTitle className="text-base font-semibold text-text-primary">
            What the log shows
          </SheetTitle>
          <SheetDescription className="mt-1 text-xs text-text-secondary">
            Everything you&rsquo;ve done, in the order you did it.
          </SheetDescription>

          <div className="mt-4 flex flex-col gap-4">
            {GLOSSARY.map((section) => (
              <div key={section.heading}>
                <SectionLabel size="xs">{section.heading}</SectionLabel>
                <dl className="mt-1.5 flex flex-col gap-2.5">
                  {section.entries.map((entry) => (
                    <div key={entry.term}>
                      <dt className="text-xs font-medium text-text-primary">
                        {entry.term}
                      </dt>
                      <dd className="text-xs text-text-secondary">
                        {entry.meaning}
                      </dd>
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
      </SheetContent>
    </Sheet>
  )
}
