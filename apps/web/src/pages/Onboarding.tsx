import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'

export function Onboarding() {
  const { getIdToken } = useAuth()
  const [username, setUsername] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle')
  const [usernameError, setUsernameError] = useState('')
  const [dateFormat, setDateFormat] = useState('MDY')
  const [ratingMode, setRatingMode] = useState('SIMPLE')
  const [displayScale, setDisplayScale] = useState('ZERO_TO_TEN')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!username) {
      setUsernameStatus('idle')
      return
    }

    const timer = setTimeout(async () => {
      setUsernameStatus('checking')
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/v1/users/check-username?username=${username}`
        )
        const data = await res.json()
        if (data.error) {
          setUsernameStatus('invalid')
          setUsernameError(data.error)
        } else {
          setUsernameStatus(data.available ? 'available' : 'taken')
        }
      } catch {
        setUsernameStatus('idle')
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [username])

  const handleSubmit = async () => {
    if (usernameStatus !== 'available') return
    setSubmitting(true)
    setError('')

    try {
      const token = await getIdToken()
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/me/onboarding`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            username,
            dateFormatPreference: dateFormat,
            ratingMode,
            ratingDisplayScale: displayScale,
          }),
        }
      )

      if (res.ok) {
        window.location.href = '/list'
      } else {
        const data = await res.json()
        setError(data.error || 'Something went wrong')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const usernameMessage = {
    idle: '',
    checking: 'Checking...',
    available: '✓ Username is available',
    taken: '✗ Username is already taken',
    invalid: `✗ ${usernameError}`,
  }[usernameStatus]

  return (
    <div style={{ maxWidth: 480, margin: '80px auto', padding: '0 24px' }}>
      <h1>Welcome to InfernoLog</h1>
      <p>Let's set up your profile before we get started.</p>

      <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 8 }}>Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your_username"
            maxLength={32}
            style={{ width: '100%', padding: '8px 12px', fontSize: 16 }}
          />
          {usernameMessage && (
            <p style={{ marginTop: 4, fontSize: 14 }}>{usernameMessage}</p>
          )}
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 8 }}>Date Format</label>
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { value: 'MDY', label: '04/20/2026' },
              { value: 'DMY', label: '20/04/2026' },
              { value: 'ISO', label: '2026-04-20' },
            ].map((opt) => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="dateFormat"
                  value={opt.value}
                  checked={dateFormat === opt.value}
                  onChange={() => setDateFormat(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 8 }}>Rating Style</label>
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { value: 'SIMPLE', label: 'Simple (single score)' },
              { value: 'WEIGHTED', label: 'Weighted (multiple categories)' },
            ].map((opt) => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="ratingMode"
                  value={opt.value}
                  checked={ratingMode === opt.value}
                  onChange={() => setRatingMode(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 8 }}>Rating Scale</label>
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { value: 'ZERO_TO_TEN', label: '0-10 (e.g. 7.5)' },
              { value: 'ZERO_TO_HUNDRED', label: '0-100 (e.g. 75)' },
            ].map((opt) => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="displayScale"
                  value={opt.value}
                  checked={displayScale === opt.value}
                  onChange={() => setDisplayScale(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {error && <p style={{ color: 'red' }}>{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={usernameStatus !== 'available' || submitting}
          style={{ padding: '12px 24px', fontSize: 16, cursor: 'pointer' }}
        >
          {submitting ? 'Creating profile...' : 'Create My Profile'}
        </button>
      </div>
    </div>
  )
}