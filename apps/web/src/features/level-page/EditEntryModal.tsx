import { Pencil, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  DateFormatPreference,
  RatingDisplayScale,
} from '@/lib/api/wireEnums'
import { EditModalShell } from './EditModalShell'
import { EditRunFields } from './EditRunFields'
import { EditLevelFields } from './EditLevelFields'
import type { LevelPageData } from './types'
import { useEditEntryModal, type EditEntryTab } from './useEditEntryModal'

interface EditEntryModalProps {
  open: boolean
  onClose: () => void
  data: LevelPageData
  levelId: string
  scale: RatingDisplayScale
  datePref: DateFormatPreference
}

/**
 * Both halves of an entry in one dialog: the most recent run and the level's
 * own fields, split across two tabs because they mean different things — one
 * describes a single session, the other the level overall. Saving writes both
 * in a single request, so switching tabs never loses the other's edits.
 */
export function EditEntryModal({
  open,
  onClose,
  data,
  levelId,
  scale,
  datePref,
}: EditEntryModalProps) {
  const {
    ready,
    run,
    level,
    hasRun,
    tab,
    setTab,
    runError,
    levelError,
    entryLabel,
    levelName,
    handleSave,
    isSaving,
    hasFieldError,
  } = useEditEntryModal({ open, onClose, data, levelId, scale, datePref })

  if (!ready) return null

  const onRun = hasRun && tab === 'run'

  return (
    <EditModalShell
      open={open}
      onClose={onClose}
      title="Edit entry"
      subtitle={levelName}
      onSave={handleSave}
      isSaving={isSaving}
      saveDisabled={hasFieldError}
      belowHeader={
        hasRun && (
          <TabStrip
            tab={tab}
            onTab={setTab}
            runError={runError}
            levelError={levelError}
            caption={
              onRun
                ? `This run only — editing ${entryLabel}.`
                : 'The level overall — shared by every run on it.'
            }
          />
        )
      }
    >
      <div
        role="tabpanel"
        id={`edit-entry-panel-${onRun ? 'run' : 'level'}`}
        aria-labelledby={`edit-entry-tab-${onRun ? 'run' : 'level'}`}
        className="space-y-6"
      >
        {onRun ? (
          <EditRunFields state={run} scale={scale} />
        ) : (
          <EditLevelFields state={level} scale={scale} />
        )}
      </div>
    </EditModalShell>
  )
}

const TABS = [
  { value: 'run', label: 'This run', icon: Pencil },
  { value: 'level', label: 'Level', icon: Settings2 },
] as const satisfies ReadonlyArray<{
  value: EditEntryTab
  label: string
  icon: typeof Pencil
}>

/**
 * The run/level switch. A real tablist rather than a {@link Segmented} group:
 * these pick which panel is on screen, not a value the form submits.
 */
function TabStrip({
  tab,
  onTab,
  runError,
  levelError,
  caption,
}: {
  tab: EditEntryTab
  onTab: (tab: EditEntryTab) => void
  runError: boolean
  levelError: boolean
  caption: string
}) {
  return (
    <div className="px-5 pb-3">
      <div
        role="tablist"
        aria-label="What to edit"
        className="flex gap-1 rounded-lg border border-border-subtle bg-bg-elevated/50 p-1"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          onTab(tab === 'run' ? 'level' : 'run')
        }}
      >
        {TABS.map(({ value, label, icon: Icon }) => {
          const active = tab === value
          return (
            <button
              key={value}
              type="button"
              role="tab"
              id={`edit-entry-tab-${value}`}
              aria-selected={active}
              aria-controls={`edit-entry-panel-${value}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onTab(value)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-text-secondary hover:text-text-primary'
              )}
            >
              <Icon size={14} />
              {label}
              {(value === 'run' ? runError : levelError) && (
                <span
                  aria-label="has an invalid field"
                  className="size-1.5 rounded-full bg-danger"
                />
              )}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-text-tertiary">{caption}</p>
    </div>
  )
}
