import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

interface RankingToolbarProps {
  search: string
  onSearch: (v: string) => void
  showUnrated: boolean
  onShowUnrated: (v: boolean) => void
}

export function RankingToolbar({
  search,
  onSearch,
  showUnrated,
  onShowUnrated,
}: RankingToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search your ranking…"
          className="pl-9"
        />
      </div>

      <div className="flex items-center gap-5 sm:ml-auto">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary">
          <span>Show unrated</span>
          <Switch checked={showUnrated} onCheckedChange={onShowUnrated} />
        </label>

        {/* Non-completions is a v2 feature — present but inert. */}
        <div
          className="flex items-center gap-2 text-sm text-text-tertiary"
          title="Coming in v2"
        >
          <span>Non-completions</span>
          <span className="rounded bg-[var(--color-bg-subtle)] px-1 text-[10px] font-bold uppercase">
            v2
          </span>
          <Switch checked={false} disabled />
        </div>
      </div>
    </div>
  )
}
