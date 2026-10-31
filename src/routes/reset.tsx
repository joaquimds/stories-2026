import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { SITE_TITLE } from '../lib/site.ts'
import { resetPassword } from '../server/fns/auth.ts'

export const Route = createFileRoute('/reset')({
  head: () => ({ meta: [{ title: `Reset password | ${SITE_TITLE}` }] }),
  component: Reset,
})

function Reset() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The token travels in the fragment so it never reaches server logs. It
  // isn't rendered, so reading it only in the browser is safe to hydrate.
  const [token] = useState(() =>
    typeof window === 'undefined'
      ? null
      : window.location.hash.substring(1) || null,
  )
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) {
      setError('This reset link is invalid or has been used')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await resetPassword({ data: { token, password } })
      if (result.ok) {
        window.location.href = '/login'
        return
      }
      setError(result.error)
    } catch {
      setError('Something went wrong, please try again')
    }
    setBusy(false)
  }

  return (
    <div>
      <h1>Reset password</h1>
      <form onSubmit={onSubmit} className="form">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          onChange={(e) => setPassword(e.target.value)}
        />
        <label htmlFor="confirm-password">Confirm password</label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <button
          className="button submit"
          disabled={busy || password !== confirmPassword}
        >
          Submit
        </button>
        {error ? <small className="error">{error}</small> : null}
      </form>
    </div>
  )
}
