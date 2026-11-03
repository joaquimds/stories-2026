import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useWriting } from '../lib/use-writing.ts'
import type { Page } from '../domain/pagination.ts'
import type { StorySearch } from '../domain/search.ts'
import type { SessionUser } from '../server/auth/sessions.ts'
import type { LinkCandidate, Story } from '../server/data/stories.ts'
import { Pager } from './Pager.tsx'
import styles from './Write.module.css'

type Props = {
  story: Story
  user: SessionUser | null
  search: StorySearch
  link: Page<LinkCandidate> | null
}

const LINK_RESET = {
  'l.dir': undefined,
  'l.from': undefined,
  'l.q': undefined,
  'l.after': undefined,
  'l.before': undefined,
}

export const Write = ({ story, user, search, link }: Props) => {
  const navigate = useNavigate()
  // On the home page, linking makes an existing sentence a new beginning
  const canLink = Boolean(user)
  const linking = canLink && search.tab === 'link'
  const { content, onChange, submit, linkTo, busy, error } = useWriting({
    thread: story.thread,
    user,
    back: story.permalink,
    onWritten: (thread) =>
      navigate({ to: '/s/$story', params: { story: thread } }),
    onLinked: (thread) =>
      navigate({ to: '/s/$story', params: { story: thread }, search: {} }),
  })

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void submit()
  }

  const onLink = (sentenceId: number) => void linkTo(sentenceId)

  return (
    <div className={`${styles.write} ${linking ? styles.expand : ''}`}>
      <div className={styles.tabs}>
        <div className={styles.tab}>
          <Link
            to="."
            search={(prev: object) => ({
              ...prev,
              ...LINK_RESET,
              tab: undefined,
            })}
            className={`link ${linking ? '' : 'current'}`}
            replace
          >
            Write
          </Link>
        </div>
        <div className={styles.tab}>
          {canLink ? (
            <Link
              to="."
              search={(prev: object) => ({ ...prev, tab: 'link' as const })}
              className={`link ${linking ? 'current' : ''}`}
              replace
            >
              Link
            </Link>
          ) : (
            <button type="button" className="link" disabled>
              Link
            </button>
          )}
        </div>
      </div>
      {linking && link ? (
        <LinkBrowser search={search} page={link} busy={busy} onLink={onLink} />
      ) : (
        <form onSubmit={onSubmit}>
          <textarea
            aria-label="Write"
            value={content}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Write"
            maxLength={280}
          />
          {user ? (
            <button className="button" disabled={busy || !content.trim()}>
              Submit
            </button>
          ) : (
            <button className="button">
              {content.trim() ? 'Log in to publish' : 'Log in to contribute'}
            </button>
          )}
        </form>
      )}
      {error ? (
        <small className={`error ${styles.error}`}>{error}</small>
      ) : null}
    </div>
  )
}

type BrowserProps = {
  search: StorySearch
  page: Page<LinkCandidate>
  busy: boolean
  onLink: (sentenceId: number) => void
}

const LinkBrowser = ({ search, page, busy, onLink }: BrowserProps) => {
  const navigate = useNavigate()
  const [query, setQuery] = useState(search['l.q'] ?? '')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const applyQuery = (value: string) =>
    navigate({
      to: '.',
      search: (prev: object) => ({
        ...prev,
        'l.q': value.trim() || undefined,
        'l.after': undefined,
        'l.before': undefined,
      }),
      replace: true,
    })

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <div className={styles.search}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          clearTimeout(timer.current)
          void applyQuery(query)
        }}
      >
        <input type="hidden" name="tab" value="link" />
        <input
          type="search"
          name="l.q"
          aria-label="Search"
          placeholder="Search"
          value={query}
          onChange={(e) => {
            const value = e.target.value
            setQuery(value)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => void applyQuery(value), 300)
          }}
        />
      </form>
      <div className={styles.results}>
        {page.items.length ? (
          <ul>
            {page.items.map((r) => (
              <li key={r.id} className={styles['link-actions']}>
                <span className={`aside ${styles.relative}`}>
                  (trace{' '}
                  <Relative id={r.id} direction="parents" enabled={r.hasParent}>
                    back
                  </Relative>
                  )
                </span>
                <button
                  className={`link ${styles.link}`}
                  type="button"
                  disabled={busy}
                  onClick={() => onLink(r.id)}
                >
                  → {r.content}
                </button>
                <span className={`aside ${styles.relative}`}>
                  (check{' '}
                  <Relative id={r.id} direction="children" enabled={r.hasChild}>
                    ahead
                  </Relative>
                  )
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles['no-results']}>(no results)</p>
        )}
        <Pager
          page={page}
          toSearch={(params) => ({
            'l.after': 'after' in params ? params.after : undefined,
            'l.before': 'before' in params ? params.before : undefined,
          })}
        />
      </div>
    </div>
  )
}

type RelativeProps = {
  id: number
  direction: 'parents' | 'children'
  enabled: boolean
  children: React.ReactNode
}

// Moves the browser to the sentences around a result
const Relative = ({ id, direction, enabled, children }: RelativeProps) =>
  enabled ? (
    <Link
      to="."
      search={(prev: object) => ({
        ...prev,
        ...LINK_RESET,
        'l.dir': direction,
        'l.from': id,
      })}
      className="link"
      replace
    >
      {children}
    </Link>
  ) : (
    <button type="button" className="link" disabled>
      {children}
    </button>
  )
