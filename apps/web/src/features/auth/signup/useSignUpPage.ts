import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { clearAuthNotice, peekAuthNotice } from '../authNotice'

/**
 * The signup page shell: the Google button, and the notice left by a Google
 * signup refused because its email already belongs to another account.
 */
export function useSignUpPage() {
  const { signUp } = useAuth()
  const [notice] = useState(() =>
    peekAuthNotice() === 'account-exists' ? 'account-exists' : null
  )

  useEffect(() => {
    if (notice) clearAuthNotice()
  }, [notice])

  return { notice, signUpWithGoogle: signUp }
}
