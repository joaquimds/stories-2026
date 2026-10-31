import { Link } from '@tanstack/react-router'
import { CONTACT_EMAIL } from '../lib/site.ts'
import styles from './Footer.module.css'

export const Footer = () => (
  <footer className={styles.footer}>
    <p>
      Made by{' '}
      <a
        href="https://bsky.app/profile/joaquimds.bsky.social"
        target="_blank"
        rel="noopener noreferrer"
      >
        @joaquimds
      </a>
    </p>
    <p className={styles.links}>
      <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
      <Link to="/stats">Stats</Link>
    </p>
  </footer>
)
