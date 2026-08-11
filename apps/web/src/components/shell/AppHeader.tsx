import { Link } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { AvatarMenu } from './AvatarMenu'
import { Logo } from './Logo'
import { DEFAULT_SEARCH_STATE } from '@/lib/levelSearchParams'

/**
 * The app header. Search now lives on its own /search tab (a full, filterable,
 * paginated search), so the header carries only a shortcut into it rather than a
 * live search field.
 */
export function AppHeader() {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border-subtle bg-bg-surface px-4 xl:px-6">
      <div className="xl:hidden">
        <Logo variant="icon" />
      </div>
      <div className="hidden xl:block">
        <Logo variant="full" />
      </div>

      <div className="flex flex-1 justify-end md:justify-start">
        {/* Desktop: a search-box-styled shortcut into /search. */}
        <Link
          to="/search"
          search={DEFAULT_SEARCH_STATE}
          className="hidden h-10 w-full max-w-md items-center gap-2 rounded-btn border border-border bg-bg-elevated px-3 text-sm text-text-tertiary transition-colors hover:border-text-tertiary/70 md:flex"
        >
          <Search size={16} />
          Search levels…
        </Link>

        {/* Mobile: a compact icon button. */}
        <Link
          to="/search"
          search={DEFAULT_SEARCH_STATE}
          aria-label="Search levels"
          className="flex size-10 items-center justify-center rounded-btn text-text-secondary hover:text-text-primary md:hidden"
        >
          <Search size={20} />
        </Link>
      </div>

      <AvatarMenu />
    </header>
  )
}
