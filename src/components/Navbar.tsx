import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { SessionUser } from '../server/auth/sessions.ts'
import { SITE_TITLE } from '../lib/site.ts'
import styles from './Navbar.module.css'

// On narrow screens the links fold into a menu that drops down below the
// bar, closed by choosing a link, the button, Escape or a click elsewhere
export const Navbar = ({ user }: { user: SessionUser | null }) => {
  const [open, setOpen] = useState(false)
  const nav = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    const onPointer = (event: PointerEvent) => {
      if (!(
        event.target instanceof Node && nav.current?.contains(event.target)
      )) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  return (
    <nav ref={nav} className={styles.navbar}>
      <Link to="/" className={styles.logo} onClick={() => setOpen(false)}>
        <img src="/tree.svg" alt="" />
        <span>{SITE_TITLE}</span>
      </Link>
      <button
        type="button"
        className={styles.menu}
        aria-label="Menu"
        aria-expanded={open}
        aria-controls="nav-links"
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          {open ? (
            <path d="M6 6l12 12M18 6 6 18" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>
      <div
        id="nav-links"
        className={`${styles.links} ${open ? styles.open : ''}`}
        onClick={() => setOpen(false)}
      >
        <Link to="/faq">FAQ</Link>
        <Link to="/recent">Recent</Link>
        <Link to="/library">Library</Link>
        {user ? (
          <Link to="/account">Account</Link>
        ) : (
          <Link to="/login">Log in</Link>
        )}
      </div>
    </nav>
  )
}
