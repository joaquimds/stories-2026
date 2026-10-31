import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { safeNext } from '../lib/drafts.ts'
import { NOTIFICATIONS_HINT, SITE_TITLE } from '../lib/site.ts'
import { forgotPassword, login, register } from '../server/fns/auth.ts'
import styles from './login.module.css'

const MODES = {
  register: 'Register',
  login: 'Log in',
  forgotPassword: 'Forgot password',
} as const

type Mode = (typeof MODES)[keyof typeof MODES]

export const Route = createFileRoute('/login')({
  // Where to go afterwards, such as a story with an unsent draft
  validateSearch: z.object({
    next: z.string().max(2000).optional().catch(undefined),
  }),
  beforeLoad: ({ context, search }) => {
    if (context.user) {
      throw redirect({ href: safeNext(search.next) })
    }
  },
  head: () => ({ meta: [{ title: `Log in | ${SITE_TITLE}` }] }),
  component: Login,
})

function Login() {
  const { next } = Route.useSearch()
  const [mode, setMode] = useState<Mode>(MODES.login)
  const [busy, setBusy] = useState(false)
  const [sentEmail, setSentEmail] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isNotifiable, setNotifiable] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result =
        mode === MODES.register
          ? await register({ data: { name, email, password, isNotifiable } })
          : mode === MODES.login
            ? await login({ data: { email, password } })
            : await forgotPassword({ data: { email } })
      if (!result.ok) {
        setError(result.error)
        setBusy(false)
      } else if (mode === MODES.forgotPassword) {
        setSentEmail(true)
      } else {
        // A full load picks up the new session everywhere
        window.location.href = safeNext(next)
      }
    } catch {
      setError('Something went wrong, please try again')
      setBusy(false)
    }
  }

  const changeMode = (next: Mode) => {
    setError(null)
    setMode(next)
  }

  const oppositeMode = mode === MODES.login ? MODES.register : MODES.login

  if (sentEmail) {
    return (
      <div className={styles.login}>
        <h1>{mode}</h1>
        <p>Please check your email for further instructions.</p>
      </div>
    )
  }

  return (
    <div className={styles.login}>
      <h1>{mode}</h1>
      {next && mode !== MODES.forgotPassword ? (
        <p className={styles.note}>
          (log in or register, then you&apos;ll be taken back to your story)
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="form">
        {mode === MODES.register ? (
          <>
            <label htmlFor="name">Pen name</label>
            <input
              type="text"
              id="name"
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </>
        ) : null}
        <label htmlFor="email">Email address</label>
        <input
          type="email"
          id="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {mode === MODES.register ? (
          <>
            <label htmlFor="notifiable">Receive email notifications</label>
            <small>{NOTIFICATIONS_HINT}</small>
            <input
              type="checkbox"
              id="notifiable"
              checked={isNotifiable}
              onChange={(e) => setNotifiable(e.target.checked)}
            />
          </>
        ) : null}
        {mode !== MODES.forgotPassword ? (
          <>
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              autoComplete={
                mode === MODES.register ? 'new-password' : 'current-password'
              }
              minLength={mode === MODES.register ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </>
        ) : null}
        <button disabled={busy} className="button submit">
          {mode === MODES.forgotPassword ? 'Submit' : mode}
        </button>
        {error ? (
          <small className={`error ${styles.error}`}>{error}</small>
        ) : null}
        <button
          type="button"
          className={`link ${styles.toggle}`}
          onClick={() => changeMode(oppositeMode)}
        >
          {oppositeMode}
        </button>
        {mode !== MODES.forgotPassword ? (
          <button
            type="button"
            className={`link ${styles['forgot-password']}`}
            onClick={() => changeMode(MODES.forgotPassword)}
          >
            Forgot password
          </button>
        ) : null}
      </form>
    </div>
  )
}
