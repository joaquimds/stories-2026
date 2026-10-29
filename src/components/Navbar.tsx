import { Link } from '@tanstack/react-router'
import type { SessionUser } from '../server/auth/sessions.ts'
import { SITE_TITLE } from '../lib/site.ts'
import styles from './Navbar.module.css'

export const Navbar = ({ user }: { user: SessionUser | null }) => (
  <nav className={styles.navbar}>
    <Link to="/" className={styles.logo}>
      <img src="/tree.svg" alt="" />
      <span>{SITE_TITLE}</span>
    </Link>
    <div className={styles.links}>
      <Link to="/faq">FAQ</Link>
      <Link to="/library">Library</Link>
      {user ? (
        <Link to="/account">Account</Link>
      ) : (
        <Link to="/login">Login</Link>
      )}
    </div>
  </nav>
)
