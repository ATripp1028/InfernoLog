import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LogOut, Settings, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNavigate, UseNavigateResult } from '@tanstack/react-router'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { MobileActionSheet } from '@/components/MobileActionSheet'

function handleNavigate(
  navigate: UseNavigateResult<string>,
  to: string,
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
) {
  navigate({ to, replace: true })
  setOpen(false)
}

export function AvatarMenu() {
  const { signOut } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open || !isDesktop) return
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open, isDesktop])

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-10 items-center justify-center rounded-full border border-border bg-bg-elevated text-text-secondary transition-colors hover:text-text-primary"
      >
        <User size={18} />
      </button>

      {isDesktop ? (
        <AnimatePresence>
          {open && (
            <motion.div
              role="menu"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-card border border-border bg-bg-elevated p-2 shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
            >
              <MenuItem
                icon={<Settings size={14} />}
                label="Settings"
                onClick={() => handleNavigate(navigate, '/settings', setOpen)}
              />
              <MenuItem
                icon={<LogOut size={14} />}
                label="Logout"
                onClick={signOut}
              />
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        <MobileActionSheet
          open={open}
          onClose={() => setOpen(false)}
          ariaLabel="Account menu"
        >
          <ul className="flex flex-col gap-1 px-2 py-2">
            <li>
              <MenuItem
                icon={<Settings size={14} />}
                label="Settings"
                onClick={() => handleNavigate(navigate, '/settings', setOpen)}
              />
            </li>
            <li>
              <MenuItem
                icon={<LogOut size={14} />}
                label="Logout"
                onClick={() => {
                  setOpen(false)
                  signOut()
                }}
              />
            </li>
          </ul>
        </MobileActionSheet>
      )}
    </div>
  )
}

interface MenuItemProps {
  icon: React.ReactNode
  label: string
  onClick?: () => void
}

function MenuItem({ icon, label, onClick }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex h-9 w-full items-center gap-3 rounded-badge px-2.5 text-left text-sm text-text-primary transition-colors hover:bg-bg-subtle"
    >
      <span className="text-text-secondary">{icon}</span>
      <span>{label}</span>
    </button>
  )
}
