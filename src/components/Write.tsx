import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { loadDraft, saveDraft } from '../lib/drafts.ts'
import type { Page } from '../domain/pagination.ts'
import type { StorySearch } from '../domain/search.ts'
import type { SessionUser } from '../server/auth/sessions.ts'
import type { LinkCandidate, Story } from '../server/data/stories.ts'
import { link as linkSentence, write } from '../server/fns/stories.ts'
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
  const [content, setContent] = useState('')
  const [draftStory, setDraftStory] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // On the home page, linking makes an existing sentence a new beginning
  const canLink = Boolean(user)
  const linking = canLink && search.tab === 'link'

  // Brings back an unsent draft for this story once in the browser
  useEffect(() => {
    if (draftStory !== story.thread) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only state, after hydration
      setContent(loadDraft(story.thread))
      setDraftStory(story.thread)
    }
  }, [draftStory, story.thread])

  const onChange = (value: string) => {
    setContent(value)
    saveDraft(story.thread, value)
  }

  const goTo = (thread: string) =>
    navigate({ to: '/s/$story', params: { story: thread } })

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      // Keep what they wrote, and come back to it after logging in
      saveDraft(story.thread, content)
      await navigate({ to: '/login', search: { next: story.permalink } })
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await write({
        data: { story: story.thread, content },
      })
      if (result.ok) {
        setContent('')
        saveDraft(story.thread, '')
        await goTo(result.thread)
      } else {
        setError(result.error)
      }
    } catch {
      setError('Something went wrong, please try again')
    } finally {
      setBusy(false)
    }
  }

  const onLink = async (sentenceId: number) => {
    setBusy(true)
    setError(null)
    try {
      const result = await linkSentence({
        data: { story: story.thread, sentenceId },
      })
      if (result.ok) {
        await navigate({
          to: '/s/$story',
          params: { story: result.thread },
          search: {},
        })
      } else {
        setError(result.error)
      }
    } catch {
      setError('Something went wrong, please try again')
    } finally {
      setBusy(false)
    }
  }

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
                <Relative id={r.id} direction="parents" enabled={r.hasParent}>
                  trace back ↑
                </Relative>
                <button
                  className={`link ${styles.link}`}
                  type="button"
                  disabled={busy}
                  onClick={() => onLink(r.id)}
                >
                  → {r.content}
                </button>
                <Relative id={r.id} direction="children" enabled={r.hasChild}>
                  check ahead ↓
                </Relative>
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
      className={`link ${styles.relative}`}
      replace
    >
      {children}
    </Link>
  ) : (
    <button type="button" className={`link ${styles.relative}`} disabled>
      {children}
    </button>
  )
