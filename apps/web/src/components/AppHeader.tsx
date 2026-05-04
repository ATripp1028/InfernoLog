import { Search } from 'lucide-react'
import { AvatarMenu } from './AvatarMenu'
import { Logo } from './Logo'

export function AppHeader() {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border-subtle bg-bg-surface px-4 xl:px-6">
      <div className="xl:hidden">
        <Logo variant="icon" />
      </div>
      <div className="hidden xl:block">
        <Logo variant="full" />
      </div>

      <div className="flex h-10 flex-1 items-center gap-2 rounded-btn border border-border bg-bg-elevated px-3 text-text-tertiary">
        <Search size={16} />
        <input
          type="search"
          placeholder="Search levels…"
          aria-label="Search levels"
          className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
          readOnly
        />
      </div>

      <AvatarMenu />
    </header>
  )
}
