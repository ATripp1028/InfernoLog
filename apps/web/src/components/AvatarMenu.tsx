import { useEffect, useRef, useState } from 'react'
import { LogOut, Settings, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export function AvatarMenu() {
  const { signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="flex size-10 items-center justify-center rounded-full border border-border bg-bg-elevated text-text-secondary transition-colors hover:text-text-primary"
      >
        <User size={18} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-card border border-border bg-bg-elevated p-2 shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
        >
          <MenuItem icon={<User size={14} />} label="Profile" />
          <MenuItem icon={<Settings size={14} />} label="Settings" />
          <MenuItem icon={<LogOut size={14} />} label="Logout" onClick={signOut} />
        </div>
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
