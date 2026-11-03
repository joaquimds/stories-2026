import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { SessionUser } from '../server/auth/sessions.ts'
import { link, write } from '../server/fns/stories.ts'
import { loadDraft, saveDraft } from './drafts.ts'
import { useAction } from './use-action.ts'

// Writing on from a story, and linking a sentence into it, the same on the
// story page and the map: an unsent draft kept per story in this browser,
// logged-out writers sent to log in and brought back to `back`, and errors
// shown the same way. `onWritten` and `onLinked` take the new story's thread.
export const useWriting = ({
  thread,
  user,
  back,
  onWritten,
  onLinked,
}: {
  thread: string
  user: SessionUser | null
  back: string
  onWritten: (thread: string) => Promise<unknown>
  onLinked: (thread: string) => Promise<unknown>
}) => {
  const navigate = useNavigate()
  const action = useAction()
  const [content, setContent] = useState('')
  const [draftStory, setDraftStory] = useState<string | null>(null)

  // Brings back an unsent draft for this story once in the browser
  useEffect(() => {
    if (draftStory !== thread) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only state, after hydration
      setContent(loadDraft(thread))
      setDraftStory(thread)
    }
  }, [draftStory, thread])

  const onChange = (value: string) => {
    setContent(value)
    saveDraft(thread, value)
  }

  const submit = async () => {
    if (!user) {
      // Keep what they wrote, and come back to it after logging in
      saveDraft(thread, content)
      await navigate({ to: '/login', search: { next: back } })
      return
    }
    await action.act(
      () => write({ data: { story: thread, content } }),
      async (result) => {
        setContent('')
        saveDraft(thread, '')
        await onWritten(result.thread)
      },
    )
  }

  const linkTo = (sentenceId: number) =>
    action.act(
      () => link({ data: { story: thread, sentenceId } }),
      (result) => onLinked(result.thread),
    )

  return { ...action, content, onChange, submit, linkTo }
}
