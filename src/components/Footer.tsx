import { Link } from '@tanstack/react-router'
import styles from './Footer.module.css'

export const Footer = () => (
  <footer className={styles.footer}>
    <p>
      Made by{' '}
      <a
        href="https://twitter.com/joaquimds"
        target="_blank"
        rel="noopener noreferrer"
      >
        @joaquimds
      </a>
    </p>
    <Link to="/stats">Stats</Link>
  </footer>
)
