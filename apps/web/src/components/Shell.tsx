import type { ReactNode } from 'react'
import { AppHeader } from './AppHeader'
import { MobileNav } from './MobileNav'
import { Sidebar } from './Sidebar'
import { FabMenu } from '@/features/logging/FabMenu'
import { MobileFabProvider } from '@/context/MobileFabContext'

interface ShellProps {
  children: ReactNode
}

export function Shell({ children }: ShellProps) {
  return (
    <MobileFabProvider>
      <div className="flex h-dvh flex-col bg-bg-base text-text-primary">
        <AppHeader />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="relative flex-1 overflow-y-auto pb-[72px] md:pb-0">
            {children}
            <FabMenu />
          </main>
        </div>
        <MobileNav />
      </div>
    </MobileFabProvider>
  )
}
