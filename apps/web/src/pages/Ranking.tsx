import { Search } from 'lucide-react'
import { Switch } from '@/components/generic/switch'
import { AnimatePresence, motion } from 'framer-motion'
import { EmptyState } from '@/components/data/EmptyState'
import { PageLoading } from '@/components/shell/PageLoading'
import { DifficultyFilter } from '@/features/ranking/DifficultyFilter'
import { RankedRow } from '@/features/ranking/RankedRow'
import { RankingHeader } from '@/features/ranking/RankingHeader'
import { useRankingPage } from '@/features/ranking/useRankingPage'

/**
 * The Ranking — every rated completion ordered by rating, best first.
 *
 * The difficulty counterpart is the demon list, which the user arranges by
 * hand. This order is derived instead, from the same comparator the Log page's
 * rating sort and the event log's `rating_rank` use — over a narrower
 * population, though: completions only. See `rankingModel.buildRanking`.
 */
export function Ranking() {
  const {
    isPending,
    isError,
    scale,
    config,
    categories,
    entries,
    lastRank,
    visible,
    unrankedCount,
    search,
    setSearch,
    sort,
    toggleSort,
    difficulties,
    toggleDifficulty,
    clearDifficulties,
    showUnrated,
    setShowUnrated,
    numbering,
    setNumbering,
    editingLevelId,
    startEdit,
    cancelEdit,
    save,
    saving,
  } = useRankingPage()

  if (isPending) return <PageLoading />

  return (
    <div className="flex h-full flex-col gap-3 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Ranking</h1>
          <p className="mt-1 text-xs text-text-secondary">
            {entries.length === 0
              ? 'Ranked completions, best first.'
              : `${entries.length} ranked ${entries.length === 1 ? 'completion' : 'completions'}, best first.`}
            {/* A user looking for a level they know they finished needs to be
                told why it is not here, rather than left to wonder. "Unranked"
                rather than "unrated": in Geometry Dash an unrated level is one
                RobTop has not starred, which has nothing to do with this. */}
            {unrankedCount > 0 &&
              ` ${unrankedCount} unranked ${unrankedCount === 1 ? 'completion has' : 'completions have'} no rating yet.`}
          </p>
        </div>

        {entries.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            {/* "Unrated" is the in-game sense — no stars from RobTop — the same
                toggle the demon list carries. A level the user has not rated is
                unranked, and never appears here at all. */}
            <label
              className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary"
              title="Include levels Geometry Dash has not rated"
            >
              <span>Show unrated</span>
              <Switch checked={showUnrated} onCheckedChange={setShowUnrated} />
            </label>

            <label
              className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary"
              title="Number rows by their place in this view instead of by their place in the whole ranking"
            >
              <span>Number in view</span>
              <Switch
                checked={numbering === 'filtered'}
                onCheckedChange={(on) =>
                  setNumbering(on ? 'filtered' : 'overall')
                }
              />
            </label>

            <DifficultyFilter
              selected={difficulties}
              onToggle={toggleDifficulty}
              onClear={clearDifficulties}
            />
            <label className="relative w-full sm:w-64">
            <span className="sr-only">Search your ranking</span>
            <Search
              size={14}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your ranking…"
                className="h-9 w-full rounded-btn border border-border-subtle bg-bg-surface pl-8 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none"
              />
            </label>
          </div>
        )}
      </div>

      {isError ? (
        <EmptyState
          title="Couldn't load your ranking."
          description="Something went wrong fetching it. Try again in a moment."
        />
      ) : entries.length === 0 ? (
        <EmptyState
          title="Nothing ranked yet."
          description="Rate a completion and it takes its place here automatically — there is nothing to arrange by hand."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No levels match your filters."
          description="Try removing a filter to see more levels."
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Sticky inside this scroll container, so the labels stay put while
              the ranking scrolls under them. */}
          {categories.length > 0 && (
            <RankingHeader
              categories={categories}
              sort={sort}
              onSort={toggleSort}
            />
          )}
          {/* `layout` is what makes a re-rated row slide to its new position
              rather than jumping there. Nothing on this page is virtualized, so
              both the row's old and new neighbours stay mounted and Framer can
              animate between them. */}
          <AnimatePresence initial={false}>
            {visible.map((entry) => (
              <motion.div
                key={entry.item.level.inGameId}
                layout
                transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                className="mb-2"
              >
                <RankedRow
                  entry={entry}
                  lastRank={lastRank}
                  scale={scale}
                  config={config}
                  categories={categories}
                  editing={editingLevelId === entry.item.level.inGameId}
                  onEdit={startEdit}
                  onCancel={cancelEdit}
                  onSave={save}
                  saving={saving}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
