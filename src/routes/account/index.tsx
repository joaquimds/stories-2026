import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { forgetAppContext } from '../../lib/app-context.ts'
import { NOTIFICATIONS_HINT, SITE_TITLE } from '../../lib/site.ts'
import { logout, updateSettings } from '../../server/fns/auth.ts'
import styles from './account.module.css'

export const Route = createFileRoute('/account/')({
  head: () => ({ meta: [{ title: `Account | ${SITE_TITLE}` }] }),
  component: Account,
})

function Account() {
  const { user } = Route.useRouteContext()
  const router = useRouter()
  const [isNotifiable, setNotifiable] = useState(user.isNotifiable)
  const [busy, setBusy] = useState(false)

  const onChangeNotifiable = async (checked: boolean) => {
    setBusy(true)
    setNotifiable(checked)
    try {
      const result = await updateSettings({ data: { isNotifiable: checked } })
      if (!result.ok) {
        setNotifiable(!checked)
      }
      forgetAppContext()
      await router.invalidate()
    } catch {
      setNotifiable(!checked)
    } finally {
      setBusy(false)
    }
  }

  const onClickLogout = async () => {
    setBusy(true)
    await logout()
    window.location.href = '/'
  }

  return (
    <div className={styles.account}>
      <h1>Account</h1>
      <div className={styles.notifications}>
        <input
          type="checkbox"
          id="notifiable"
          checked={isNotifiable}
          disabled={busy}
          onChange={(e) => onChangeNotifiable(e.target.checked)}
        />
        <label htmlFor="notifiable">Receive email notifications</label>
        <small>{NOTIFICATIONS_HINT}</small>
      </div>
      <ul>
        <li>
          <Link to="/account/fragments">Your fragments</Link>
        </li>
        <li>
          <Link to="/account/links">Your links</Link>
        </li>
        <li>
          <Link to="/account/favourites">Your favourites</Link>
        </li>
        <li>
          <button
            id="logout"
            type="button"
            className="link"
            disabled={busy}
            onClick={onClickLogout}
          >
            Log out
          </button>
        </li>
      </ul>
    </div>
  )
}
