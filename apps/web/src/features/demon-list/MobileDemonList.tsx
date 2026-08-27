import { Link, useLocation } from '@tanstack/react-router'
import { ChevronUp, ChevronDown, Hash, Pencil, Search, X } from 'lucide-react'
import type { ClassicDemonListResponse } from '@infernolog/core'
import { Input } from '@/components/generic/input'
import { Button } from '@/components/generic/button'
import { Chip } from '@/components/generic/chip'
import { Sheet, SheetContent, SheetTitle } from '@/components/generic/sheet'
import { DifficultyFace } from '@/components/data/DifficultyFace'
import { formatNumber } from '@/features/logging/format'
import { backOriginState } from '@/lib/backOrigin'
import { GddlTierBadge } from '@/components/data/GddlTierBadge'
import { ThumbnailWash } from '@/components/data/ThumbnailWash'
import { medalColor } from './medals'
import { useMobileDemonList } from './useMobileDemonList'
import type { DemonListItem } from './types'

interface MobileDemonListProps {
  data: ClassicDemonListResponse
  search: string
  onSearch: (v: string) => void
  showUnrated: boolean
  onShowUnrated: (v: boolean) => void
  highlightId?: string | undefined
}

/**
 * The ranking board below the md breakpoint: one list, with placement through a sheet rather than drag-and-drop.
 */
export function MobileDemonList({
  data,
  search,
  onSearch,
  showUnrated,
  onShowUnrated,
  highlightId,
}: MobileDemonListProps) {
  const {
    view,
    unplacedView,
    filtering,
    canEdit,
    editMode,
    toggleEditMode,
    unplacedOpen,
    setUnplacedOpen,
    placeFromUnplaced,
    move,
    removeFromDemonList,
    jumpFor,
    setJumpFor,
    jumpValue,
    setJumpValue,
    submitJump,
  } = useMobileDemonList({ data, search, showUnrated })

  return (
    <div className="space-y-3 pb-[40px]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">My demon list</h1>
        <Button
          variant={editMode ? 'default' : 'outline'}
          size="sm"
          onClick={toggleEditMode}
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
          placeholder="Search your demon list…"
          className="pl-9"
        />
      </div>

      <div className="flex items-center gap-2">
        <Chip
          selected={showUnrated}
          onClick={() => onShowUnrated(!showUnrated)}
        >
          Show unrated
        </Chip>
        <Chip
          disabled
          className="cursor-not-allowed gap-1.5 opacity-60"
          title="Coming in v2"
        >
          Non-completions
          <span className="rounded bg-bg-subtle px-1 text-[10px] font-bold uppercase">
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
          <Pencil className="size-3" /> Edit mode — use ↑↓ or # to reorder, ✕ to
          remove.
        </p>
      )}

      {view.length === 0 ? (
        <p className="rounded-card border border-border-subtle bg-bg-surface p-6 text-center text-sm text-text-tertiary">
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
              onRemove={() => removeFromDemonList(entry.levelProgressId)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setUnplacedOpen(true)}
        className="fixed inset-x-4 bottom-[80px] z-10 flex items-center justify-between rounded-card border border-border-subtle bg-bg-surface px-4 py-3 text-sm shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
      >
        <span className="text-text-secondary">
          {data.unplaced.length} unplaced{' '}
          {data.unplaced.length === 1 ? 'level' : 'levels'}
        </span>
        <span className="text-primary">View →</span>
      </button>

      <Sheet open={unplacedOpen} onOpenChange={setUnplacedOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[80dvh] overflow-y-auto p-4"
        >
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
                  className="relative w-full overflow-hidden rounded-card border border-border-subtle bg-bg-elevated text-left"
                >
                  <ThumbnailWash
                    levelId={entry.level.inGameId}
                    variant="card"
                  />
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
                    {(entry.attempts != null || entry.badge) && (
                      <div className="flex shrink-0 items-center gap-2">
                        {entry.attempts != null && (
                          <span
                            title="Attempts"
                            className="text-[11px] tabular-nums text-text-secondary"
                          >
                            {formatNumber(entry.attempts)} att
                          </span>
                        )}
                        <GddlTierBadge tier={entry.badge?.gddlTier ?? null} variant="inline" />
                      </div>
                    )}
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
  item: DemonListItem
  canEdit: boolean
  highlight: boolean
  jumping: boolean
  jumpValue: string
  onJumpValue: (v: string) => void
  onStartJump: () => void
  onSubmitJump: () => void
  onUp: () => void
  onDown: () => void
  onRemove: () => void
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
  onRemove,
}: MobileRowProps) {
  const location = useLocation()
  const levelInfo = (
    <>
      <DifficultyFace
        difficulty={item.level.inGameDifficulty}
        featured={item.level.featured}
        epicValue={item.level.epicValue}
        rated={item.level.isRated}
        size={36}
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-sm font-semibold text-text-primary"
          style={{ color: medalColor(rank) }}
        >
          #{rank} — {item.level.name ?? `Level #${item.level.inGameId}`}
        </div>
        <div className="truncate text-xs text-text-secondary">
          {item.level.creator
            ? `Published by ${item.level.creator}`
            : 'Unknown creator'}
        </div>
        {(item.attempts != null || item.badge) && (
          <div className="mt-1 flex items-center gap-2">
            {item.attempts != null && (
              <span
                title="Attempts"
                className="text-[11px] tabular-nums text-text-secondary"
              >
                {formatNumber(item.attempts)} att
              </span>
            )}
            <GddlTierBadge tier={item.badge?.gddlTier ?? null} variant="inline" />
          </div>
        )}
      </div>
    </>
  )

  return (
    <div
      className={[
        'relative overflow-hidden rounded-card border bg-bg-surface',
        highlight
          ? 'border-primary ring-1 ring-primary'
          : 'border-border-subtle',
      ].join(' ')}
    >
      <ThumbnailWash levelId={item.level.inGameId} />
      <div className="relative z-10 flex items-center gap-3 p-2">
        {canEdit ? (
          <>{levelInfo}</>
        ) : (
          <Link
            to="/log/$levelId"
            params={{ levelId: item.level.inGameId }}
            state={backOriginState(location.href)}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            {levelInfo}
          </Link>
        )}

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
              <IconBtn label="Remove from ranking" onClick={onRemove}>
                <X className="size-4" />
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
      className="flex size-7 items-center justify-center rounded hover:bg-bg-elevated hover:text-text-primary"
    >
      {children}
    </button>
  )
}
