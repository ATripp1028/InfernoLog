import { Pencil, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/generic/select'
import type { EntryChoice } from './entryChoices'
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
    choices,
    entryId,
    selectEntry,
    pendingEntry,
    confirmSwitch,
    cancelSwitch,
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
          >
            {!onRun ? (
              <Caption>The level overall — shared by every run on it.</Caption>
            ) : choices.length > 1 ? (
              <>
                <EntryPicker
                  choices={choices}
                  entryId={entryId}
                  onSelect={selectEntry}
                />
                {pendingEntry && (
                  <DiscardSwitchPrompt
                    target={pendingEntry}
                    onConfirm={confirmSwitch}
                    onCancel={cancelSwitch}
                  />
                )}
              </>
            ) : (
              <Caption>This run only — editing {entryLabel}.</Caption>
            )}
          </TabStrip>
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
  children,
}: {
  tab: EditEntryTab
  onTab: (tab: EditEntryTab) => void
  runError: boolean
  levelError: boolean
  /** What the tab is scoped to — a caption, or the entry picker. */
  children: React.ReactNode
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
      <div className="mt-2">{children}</div>
    </div>
  )
}

/** The plain scope line, shown whenever there is nothing to pick between. */
function Caption({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-text-tertiary">{children}</p>
}

/**
 * Which logged entry the run half is editing.
 *
 * Deliberately the size of the caption it replaces: it opens on the newest
 * entry, so anyone here to fix their latest run never has to touch it, and
 * it only appears at all once there is a second entry to switch to.
 */
function EntryPicker({
  choices,
  entryId,
  onSelect,
}: {
  choices: EntryChoice[]
  entryId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
      <span id="edit-entry-picker-label">Editing</span>
      <Select onValueChange={onSelect} {...(entryId && { value: entryId })}>
        <SelectTrigger
          aria-labelledby="edit-entry-picker-label"
          className="h-auto w-auto gap-1 border-border-subtle bg-transparent px-1.5 py-0.5 text-xs text-text-secondary shadow-none hover:text-text-primary"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.id} value={choice.id}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span>— this run only.</span>
    </div>
  )
}

/**
 * Loading another entry replaces the form, so a switch that would throw away
 * typing stops here first. Inline rather than a confirm dialog: a second modal
 * over this one to answer a question about a one-line control is heavier than
 * the question deserves.
 */
function DiscardSwitchPrompt({
  target,
  onConfirm,
  onCancel,
}: {
  target: EntryChoice
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-danger/40 bg-danger-dim px-2.5 py-1.5 text-xs text-text-secondary">
      <span>
        Switching to {target.label} discards your unsaved changes to this run.
      </span>
      <div className="ml-auto flex shrink-0 gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="font-medium text-text-secondary hover:text-text-primary"
        >
          Keep editing
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="font-medium text-danger hover:underline"
        >
          Discard
        </button>
      </div>
    </div>
  )
}
