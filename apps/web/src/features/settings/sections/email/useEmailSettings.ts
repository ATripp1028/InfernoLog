import { useState } from 'react'
import type { MeData } from '@/lib/api/me'
import { maskEmail } from '@/lib/maskEmail'
import { peekGoogleProof } from '@/lib/googleProof'

/**
 * The Email block: the account email as shown, and whether the change dialog
 * is open. It opens by itself when the page comes back from a Google
 * re-confirmation started by the dialog.
 */
export function useEmailSettings(me: MeData, showEmails: boolean) {
  const [open, setOpen] = useState(
    () => peekGoogleProof('email-change') !== null
  )
  return {
    displayedEmail: showEmails ? me.email : maskEmail(me.email),
    open,
    openDialog: () => setOpen(true),
    closeDialog: () => setOpen(false),
  }
}
