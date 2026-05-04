import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { AppHeader } from './AppHeader'
import { MobileNav } from './MobileNav'
import { Sidebar } from './Sidebar'

interface ShellProps {
  children: ReactNode
}

export function Shell({ children }: ShellProps) {
  return (
    <div className="flex h-dvh flex-col bg-bg-base text-text-primary">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="relative flex-1 overflow-y-auto pb-[72px] md:pb-0">
          {children}
          <button
            type="button"
            aria-label="Add level"
            className="fixed bottom-6 right-6 z-20 hidden size-14 items-center justify-center rounded-fab bg-primary text-text-primary shadow-[0_4px_12px_rgba(0,0,0,0.4)] transition-colors hover:bg-primary-hover md:flex"
          >
            <Plus size={24} strokeWidth={2.5} />
          </button>
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
