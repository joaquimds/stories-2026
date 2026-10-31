import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type { SessionUser } from '../server/auth/sessions.ts'
import type { Story, StoryLine } from '../server/data/stories.ts'
import {
  edit,
  like,
  remove,
  report,
  title,
  unlink,
} from '../server/fns/stories.ts'
import { ROOT_THREAD } from '../domain/thread.ts'
import styles from './StoryText.module.css'

type Props = { story: Story; user: SessionUser | null }

type Editing = { index: number; content: string; branch: boolean }

export const StoryText = ({ story, user }: Props) => {
  const router = useRouter()
  const navigate = useNavigate()
  const [focus, setFocus] = useState<number | null>(null)
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
    setEditing(null)
    setTitling(false)
    setReported(false)
    setError(null)
  }

  const { lines } = story
  const leaf = lines.at(-1) as StoryLine
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
        setError((result as { error?: string }).error ?? 'Error')
      }
    } catch {
      setError('Unknown error')
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
                aria-label="Sentence"
                value={editing.content}
                maxLength={280}
                autoFocus
                onChange={(e) =>
                  setEditing({ ...editing, content: e.target.value })
                }
              />
              {editing.branch ? (
                <p className={styles.hint}>
                  Your variation becomes a new branch here, and the rest of the
                  story follows it. The original stays as it is.
                </p>
              ) : null}
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
        </div>
      ))}
      <Authors lines={lines} />
      {reported ? (
        <p className={styles.reported}>reported</p>
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
      </div>
      {error ? <small className="error">{error}</small> : null}
    </>
  )
}

// "By X, Y and Z", most prolific first
const Authors = ({ lines }: { lines: StoryLine[] }) => {
  const counts = new Map<string, { count: number; first: number }>()
  lines.forEach((line, i) => {
    if (line.author) {
      const entry = counts.get(line.author.name) ?? { count: 0, first: i }
      entry.count++
      counts.set(line.author.name, entry)
    }
  })
  const names = [...counts.entries()]
    .sort(([, a], [, b]) => b.count - a.count || a.first - b.first)
    .map(([name]) => name)
  if (!names.length) {
    return null
  }
  const last = names.pop()
  return <p>By {names.length ? `${names.join(', ')} and ${last}` : last}</p>
}
