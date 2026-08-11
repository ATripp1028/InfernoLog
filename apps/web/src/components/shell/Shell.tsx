import type { ReactNode } from 'react'
import { AppHeader } from './AppHeader'
import { MobileNav } from './MobileNav'
import { Sidebar } from './Sidebar'
import { Fab } from './Fab'
import { FabActionsProvider } from '@/context/FabActionsContext'

interface ShellProps {
  children: ReactNode
}

/**
 * The authenticated app frame: sidebar or bottom nav, header, FAB, and the
 * app-global logging flow provider.
 *
 * The logging provider is mounted here, not per page, because the FAB opens
 * it from anywhere.
 */
export function Shell({ children }: ShellProps) {
  return (
    <FabActionsProvider>
      <div className="flex h-dvh flex-col bg-bg-base text-text-primary">
        <AppHeader />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="relative flex-1 overflow-y-auto pb-[72px] md:pb-0">
            {children}
            <Fab />
          </main>
        </div>
        <MobileNav />
      </div>
    </FabActionsProvider>
  )
}
