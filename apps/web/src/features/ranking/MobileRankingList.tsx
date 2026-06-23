import { useState } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import { ChevronUp, ChevronDown, Hash, Pencil, Search } from 'lucide-react'
import type { ClassicRankingResponse } from '@infernolog/core'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { toast } from '@/components/ui/sonner'
import { DifficultyFace } from '@/components/DifficultyFace'
import { usePlaceRanking, useReorderRanking } from '@/lib/api/ranking'
import { neighboursAround } from './neighbours'
import { filterPlaced, filterUnplaced, reorderDisabled } from './filtering'
import { RankingBadge } from './RankingBadge'
import { ThumbnailWash } from './ThumbnailWash'
import type { RankingItem } from './types'

interface MobileRankingListProps {
  data: ClassicRankingResponse
  search: string
  onSearch: (v: string) => void
  showUnrated: boolean
  onShowUnrated: (v: boolean) => void
  highlightId?: string | undefined
}

export function MobileRankingList({
  data,
  search,
  onSearch,
  showUnrated,
  onShowUnrated,
  highlightId,
}: MobileRankingListProps) {
  const reorder = useReorderRanking()
  const place = usePlaceRanking()
  const [editMode, setEditMode] = useState(false)
  const [unplacedOpen, setUnplacedOpen] = useState(false)
  const [jumpFor, setJumpFor] = useState<string | null>(null)
  const [jumpValue, setJumpValue] = useState('')

  const placedIds = data.placed.map((e) => e.levelProgressId)
  const view = filterPlaced(data.placed, search, showUnrated)
  const filtering = reorderDisabled(data.placed.length, view.length, search)
  const canEdit = editMode && !filtering
  const unplacedView = filterUnplaced(data.unplaced, search)

  function move(id: string, dir: 'up' | 'down') {
    const i = placedIds.indexOf(id)
    const j = dir === 'up' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= placedIds.length) return
    const next = arrayMove(placedIds, i, j)
    reorder.mutate({ levelProgressId: id, ...neighboursAround(next, j) })
  }

  function submitJump(id: string) {
    const n = parseInt(jumpValue, 10)
    setJumpFor(null)
    setJumpValue('')
    if (!Number.isFinite(n)) return
    const target = Math.min(Math.max(n, 1), placedIds.length) - 1
    const i = placedIds.indexOf(id)
    if (i < 0 || i === target) return
    const next = arrayMove(placedIds, i, target)
    reorder.mutate({ levelProgressId: id, ...neighboursAround(next, target) })
  }

  // Mobile placement: drop the tapped level in at the top, then let the user
  // nudge it with ↑/↓/#. (No drag-and-drop on touch.)
  function placeFromUnplaced(id: string) {
    const belowId = placedIds[0]
    place.mutate({ levelProgressId: id, ...(belowId ? { belowId } : {}) })
    setUnplacedOpen(false)
    setEditMode(true)
    toast.success('Placed at #1 — use ↑/↓ or # to move it.')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">Ranking</h1>
        <Button
          variant={editMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => setEditMode((v) => !v)}
          className="gap-1.5"
        >
          <Pencil className="size-3.5" />
          {editMode ? 'Done' : 'Edit'}
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search your ranking…"
          className="pl-9"
        />
      </div>

      <div className="flex items-center gap-2">
        <Chip selected={showUnrated} onClick={() => onShowUnrated(!showUnrated)}>
          Show unrated
        </Chip>
        <Chip
          disabled
          className="cursor-not-allowed gap-1.5 opacity-60"
          title="Coming in v2"
        >
          Non-completions
          <span className="rounded bg-[var(--color-bg-subtle)] px-1 text-[10px] font-bold uppercase">
            v2
          </span>
        </Chip>
      </div>

      {editMode && filtering && (
        <p className="text-xs text-text-tertiary">
          Clear search / show unrated to reorder.
        </p>
      )}
      {canEdit && (
        <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
          <Pencil className="size-3" /> Edit mode — use ↑↓ or # to reorder.
        </p>
      )}

      {view.length === 0 ? (
        <p className="rounded-card border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-6 text-center text-sm text-text-tertiary">
          {data.placed.length === 0
            ? 'No ranked levels yet.'
            : 'No ranked levels match.'}
        </p>
      ) : (
        <div className="space-y-2">
          {view.map((entry) => (
            <MobileRow
              key={entry.levelProgressId}
              rank={entry.rank}
              item={entry}
              canEdit={canEdit}
              highlight={entry.levelProgressId === highlightId}
              jumping={jumpFor === entry.levelProgressId}
              jumpValue={jumpValue}
              onJumpValue={setJumpValue}
              onStartJump={() => {
                setJumpFor(entry.levelProgressId)
                setJumpValue(String(entry.rank))
              }}
              onSubmitJump={() => submitJump(entry.levelProgressId)}
              onUp={() => move(entry.levelProgressId, 'up')}
              onDown={() => move(entry.levelProgressId, 'down')}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setUnplacedOpen(true)}
        className="flex w-full items-center justify-between rounded-card border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-4 py-3 text-sm"
      >
        <span className="text-text-secondary">
          {data.unplaced.length} unplaced{' '}
          {data.unplaced.length === 1 ? 'level' : 'levels'}
        </span>
        <span className="text-[var(--color-primary)]">View →</span>
      </button>

      <Sheet open={unplacedOpen} onOpenChange={setUnplacedOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto p-4">
          <SheetTitle>Unplaced levels</SheetTitle>
          <p className="mb-3 mt-1 text-xs text-text-tertiary">
            Tap a level to place it, then fine-tune its spot.
          </p>
          <div className="space-y-2">
            {unplacedView.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-tertiary">
                Nothing to place.
              </p>
            ) : (
              unplacedView.map((entry) => (
                <button
                  key={entry.levelProgressId}
                  type="button"
                  onClick={() => placeFromUnplaced(entry.levelProgressId)}
                  className="relative w-full overflow-hidden rounded-card border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] text-left"
                >
                  <ThumbnailWash levelId={entry.level.inGameId} variant="card" />
                  <div className="relative z-10 flex items-center gap-3 p-2">
                    <DifficultyFace
                      difficulty={entry.level.inGameDifficulty}
                      featured={entry.level.featured}
                      epicValue={entry.level.epicValue}
                      rated={entry.level.isRated}
                      size={32}
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-text-primary">
                        {entry.level.name ?? `Level #${entry.level.inGameId}`}
                      </div>
                      <div className="truncate text-xs text-text-secondary">
                        {entry.level.creator
                          ? `By ${entry.level.creator}`
                          : 'Unknown creator'}
                      </div>
                    </div>
                    {entry.badge && <RankingBadge badge={entry.badge} />}
                  </div>
                </button>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

interface MobileRowProps {
  rank: number
  item: RankingItem
  canEdit: boolean
  highlight: boolean
  jumping: boolean
  jumpValue: string
  onJumpValue: (v: string) => void
  onStartJump: () => void
  onSubmitJump: () => void
  onUp: () => void
  onDown: () => void
}

function MobileRow({
  rank,
  item,
  canEdit,
  highlight,
  jumping,
  jumpValue,
  onJumpValue,
  onStartJump,
  onSubmitJump,
  onUp,
  onDown,
}: MobileRowProps) {
  return (
    <div
      className={[
        'relative overflow-hidden rounded-card border bg-[var(--color-bg-surface)]',
        highlight
          ? 'border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]'
          : 'border-[var(--color-border-subtle)]',
      ].join(' ')}
    >
      <ThumbnailWash levelId={item.level.inGameId} />
      <div className="relative z-10 flex items-center gap-3 p-2">
        <DifficultyFace
          difficulty={item.level.inGameDifficulty}
          featured={item.level.featured}
          epicValue={item.level.epicValue}
          rated={item.level.isRated}
          size={36}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-text-primary">
          #{rank} — {item.level.name ?? `Level #${item.level.inGameId}`}
        </div>
        <div className="truncate text-xs text-text-secondary">
          {item.level.creator
            ? `Published by ${item.level.creator}`
            : 'Unknown creator'}
        </div>
        {item.badge && (
          <div className="mt-1">
            <RankingBadge badge={item.badge} />
          </div>
        )}
      </div>

      {canEdit &&
        (jumping ? (
          <Input
            autoFocus
            value={jumpValue}
            inputMode="numeric"
            onChange={(e) => onJumpValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmitJump()
            }}
            onBlur={onSubmitJump}
            className="h-8 w-14 text-center"
            aria-label="Jump to position"
          />
        ) : (
          <div className="flex shrink-0 items-center gap-1 text-text-secondary">
            <IconBtn label="Move up" onClick={onUp}>
              <ChevronUp className="size-4" />
            </IconBtn>
            <IconBtn label="Move down" onClick={onDown}>
              <ChevronDown className="size-4" />
            </IconBtn>
            <IconBtn label="Jump to position" onClick={onStartJump}>
              <Hash className="size-4" />
            </IconBtn>
          </div>
        ))}
      </div>
    </div>
  )
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded hover:bg-[var(--color-bg-elevated)] hover:text-text-primary"
    >
      {children}
    </button>
  )
}
