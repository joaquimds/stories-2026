import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type { SessionUser } from '../server/auth/sessions.ts'
import type { Fork, Story, StoryLine } from '../server/data/stories.ts'
import {
  edit,
  like,
  remove,
  report,
  title,
  unlink,
} from '../server/fns/stories.ts'
import { ROOT_THREAD } from '../domain/thread.ts'
import { Authors } from './Authors.tsx'
import styles from './StoryText.module.css'
import { last } from '../domain/present.ts'

type Props = { story: Story; user: SessionUser | null }

type Editing = { index: number; content: string; branch: boolean }

export const StoryText = ({ story, user }: Props) => {
  const router = useRouter()
  const navigate = useNavigate()
  const [focus, setFocus] = useState<number | null>(null)
  const [openFork, setOpenFork] = useState<number | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [titling, setTitling] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [reported, setReported] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resets local state when navigating to another story
  const [thread, setThread] = useState(story.thread)
  if (thread !== story.thread) {
    setThread(story.thread)
    setFocus(null)
    setOpenFork(null)
    setEditing(null)
    setTitling(false)
    setReported(false)
    setError(null)
  }

  const { lines } = story
  const leaf = last(lines)
  const lastIndex = lines.length - 1

  // Runs an action, then shows its error or hands its result to `then`
  const act = async <T extends { ok: boolean }>(
    action: () => Promise<T>,
    then: (result: Extract<T, { ok: true }>) => Promise<unknown> | void,
  ) => {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      if (result.ok) {
        await then(result as Extract<T, { ok: true }>)
      } else {
        setError(
          (result as { error?: string }).error ??
            'Something went wrong, please try again',
        )
      }
    } catch {
      setError('Something went wrong, please try again')
    } finally {
      setBusy(false)
    }
  }

  const goTo = (thread: string) =>
    thread === ROOT_THREAD
      ? navigate({ to: '/' })
      : navigate({ to: '/s/$story', params: { story: thread } })

  const onSubmitEdit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) {
      return
    }
    void act(
      () => edit({ data: { story: story.thread, ...editing } }),
      async (result) => {
        setEditing(null)
        setFocus(null)
        if (result.thread === story.thread) {
          await router.invalidate()
        } else {
          await goTo(result.thread)
        }
      },
    )
  }

  const onSubmitTitle = (e: React.FormEvent) => {
    e.preventDefault()
    void act(
      () => title({ data: { story: story.thread, title: newTitle } }),
      async (result) => {
        setTitling(false)
        await navigate({ to: '/s/$story', params: { story: result.slug } })
      },
    )
  }

  // `index` is the line's position in the whole story, root included
  const startEditing = (line: StoryLine, branch: boolean) =>
    setEditing({ index: line.index, branch, content: line.content })

  return (
    <>
      {story.title ? <h1>{story.title}</h1> : null}
      {lines.map((line, i) => (
        <div key={`${i}-${line.id}`} className={styles.content}>
          {editing?.index === line.index ? (
            <form className={styles.editing} onSubmit={onSubmitEdit}>
              <textarea
                aria-label="Fragment"
                value={editing.content}
                maxLength={280}
                autoFocus
                onChange={(e) =>
                  setEditing({ ...editing, content: e.target.value })
                }
              />
              <div>
                <button
                  className={`${styles['edit-save']} link`}
                  disabled={
                    busy ||
                    !editing.content.trim() ||
                    editing.content === line.content
                  }
                >
                  {editing.branch ? 'save variation' : 'save'}
                </button>
                <button
                  type="button"
                  className={`${styles.delete} link`}
                  onClick={() => setEditing(null)}
                >
                  cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              {user ? (
                <button
                  type="button"
                  className={`${styles.sentence} link`}
                  aria-expanded={focus === i}
                  onClick={() => setFocus(focus === i ? null : i)}
                >
                  {line.content}
                </button>
              ) : i === lastIndex ? (
                <span className={styles.sentence}>{line.content}</span>
              ) : (
                <Link to={line.permalink} className={styles.sentence}>
                  {line.content}
                </Link>
              )}
              {focus === i && user ? (
                <div className={styles['sentence-actions']}>
                  {i !== lastIndex ? (
                    <Link to={line.permalink} className={styles.view}>
                      view
                    </Link>
                  ) : null}
                  {line.author?.id === user.id && line.editable ? (
                    <button
                      className={`${styles.edit} link`}
                      type="button"
                      disabled={busy}
                      onClick={() => startEditing(line, false)}
                    >
                      edit
                    </button>
                  ) : null}
                  {!line.deleted ? (
                    <button
                      className={`${styles.rewrite} link`}
                      type="button"
                      disabled={busy}
                      onClick={() => startEditing(line, true)}
                    >
                      write a variation
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
          {line.fork ? (
            <ForkMark
              fork={line.fork}
              open={openFork === line.index}
              onToggle={() =>
                setOpenFork(openFork === line.index ? null : line.index)
              }
            />
          ) : null}
        </div>
      ))}
      <Authors authors={lines.map((l) => l.author)} />
      {reported ? (
        <p className={styles.reported}>(reported)</p>
      ) : titling ? (
        <form onSubmit={onSubmitTitle} className={styles.form}>
          <label htmlFor="title">Title</label>
          <input
            id="title"
            value={newTitle}
            maxLength={100}
            autoFocus
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <div className={styles.actions}>
            <button
              disabled={busy || !newTitle.trim()}
              className={`link ${styles.save}`}
            >
              save
            </button>
            <button
              type="button"
              onClick={() => setTitling(false)}
              className={`link ${styles.delete}`}
            >
              cancel
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.actions}>
          {user ? (
            <button
              type="button"
              disabled={busy}
              className={`link ${styles.like}`}
              onClick={() =>
                act(
                  () =>
                    like({
                      data: { story: story.thread, liked: !story.liked },
                    }),
                  () => router.invalidate(),
                )
              }
            >
              {story.liked ? 'unfavourite' : 'favourite'}
            </button>
          ) : null}
          {story.isLeafAuthor && !leaf.deleted ? (
            <>
              <button
                type="button"
                disabled={busy}
                className={`link ${styles.save}`}
                onClick={() => {
                  setNewTitle(story.title ?? '')
                  setTitling(true)
                }}
              >
                title
              </button>
              <button
                type="button"
                disabled={busy}
                className={`link ${styles.delete}`}
                onClick={() =>
                  act(
                    () => remove({ data: { story: story.thread } }),
                    (result) =>
                      result.deleted
                        ? goTo(result.parentThread)
                        : router.invalidate(),
                  )
                }
              >
                delete
              </button>
            </>
          ) : null}
          {story.canUnlink ? (
            <button
              type="button"
              disabled={busy}
              className={`link ${styles.delete}`}
              onClick={() =>
                act(
                  () => unlink({ data: { story: story.thread } }),
                  (result) => goTo(result.parentThread),
                )
              }
            >
              unlink
            </button>
          ) : null}
          {!story.isLeafAuthor && !story.canUnlink && leaf.author ? (
            <button
              type="button"
              disabled={busy}
              className={`link ${styles.delete}`}
              onClick={() =>
                act(
                  () => report({ data: { sentenceId: leaf.id } }),
                  () => setReported(true),
                )
              }
            >
              report
            </button>
          ) : null}
        </div>
      )}
      <div className={styles.actions}>
        <a
          download={`${story.title ?? 'story'}.txt`}
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(
            lines.map((l) => l.content).join('\n\n'),
          )}`}
        >
          download
        </a>
        <Link
          to="/read/$story"
          params={{ story: story.permalink.replace(/^\/s\//, '') }}
          className={styles.read}
        >
          read as one piece
        </Link>
        <Link
          to="/map/$story"
          params={{ story: story.permalink.replace(/^\/s\//, '') }}
          className={styles.read}
        >
          map
        </Link>
      </div>
      {error ? <small className="error">{error}</small> : null}
    </>
  )
}

// A path icon in the margin where the story could have gone another way,
// which lists the alternatives
const ForkMark = ({
  fork,
  open,
  onToggle,
}: {
  fork: Fork
  open: boolean
  onToggle: () => void
}) => {
  const label = `${fork.count} other ${fork.count === 1 ? 'path' : 'paths'} here`
  return (
    <>
      <button
        type="button"
        className={`${styles.fork} ${open ? styles['fork-open'] : ''}`}
        aria-label={label}
        aria-expanded={open}
        title={label}
        onClick={onToggle}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path
            d="M8 15V9M8 9 3.5 3M8 9l4.5-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="3.5" cy="2.5" r="1.6" fill="currentColor" />
          <circle cx="12.5" cy="2.5" r="1.6" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <ul className={styles.alternatives}>
          {fork.options.map((option) => (
            <li key={option.id}>
              <Link to={option.permalink}>→ {option.content}</Link>
            </li>
          ))}
          {fork.count > fork.options.length ? (
            <li>
              <Link to={fork.allPermalink}>(all {fork.count})</Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </>
  )
}
