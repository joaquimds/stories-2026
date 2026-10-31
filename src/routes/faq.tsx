import { Link, createFileRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { SITE_TITLE } from '../lib/site.ts'
import styles from './faq.module.css'

export const Route = createFileRoute('/faq')({
  head: () => ({ meta: [{ title: `FAQ | ${SITE_TITLE}` }] }),
  component: FAQ,
})

const CONTENT: { question: string; answer: ReactNode }[] = [
  {
    question: 'What is this website for?',
    answer: (
      <p>
        Tree of Tales is a free online tool for reading and writing
        collaborative, non-linear fiction.
      </p>
    ),
  },
  {
    question: 'How do I read existing stories?',
    answer: (
      <>
        <p>
          Begin reading a story by choosing an initial fragment from the right
          hand side of the <Link to="/">home page</Link> (the bottom of the page
          on mobile). Choose further fragments to continue the story.
        </p>
        <p>
          View completed stories by visiting the{' '}
          <Link to="/library">library</Link>.
        </p>
      </>
    ),
  },
  {
    question: 'How do I create a new story?',
    answer: (
      <p>
        Start a new story by submitting a new fragment on the{' '}
        <Link to="/">home page</Link>. The form to do this is at the bottom of
        the list on the right hand side of the page (the bottom of the page on
        mobile).
      </p>
    ),
  },
  {
    question: 'How do I add to an existing story?',
    answer: (
      <p>
        Submit a new fragment while viewing the story you wish to add to. For
        example, choose any beginning on the <Link to="/">home page</Link> and
        add to it.
      </p>
    ),
  },
  {
    question: 'How do I save a story in the library?',
    answer: (
      <p>
        Stories are added to the library when they are given a title. A{' '}
        {'"title"'} button should appear at the bottom of any story that ends
        with a fragment written by you. Click this button and submit a title to
        save the story in the library.
      </p>
    ),
  },
  {
    question: 'Can I export my work?',
    answer: (
      <p>
        Any story can be downloaded using the {'"download"'} button, found at
        the bottom of the story text.
      </p>
    ),
  },
  {
    question: 'How do I see all the fragments I have written?',
    answer: (
      <p>
        You can view these from your account page,{' '}
        <Link to="/account/fragments">here</Link>.
      </p>
    ),
  },
  {
    question: 'Can I edit or delete my fragments?',
    answer: (
      <p>
        You can edit your fragments, but only until they exist in other{' '}
        {"users'"} stories. You can always delete your fragments.
      </p>
    ),
  },
  {
    question: 'Can I change a sentence someone else wrote?',
    answer: (
      <>
        <p>
          Not the original, but you can write a variation of it. Once you have
          an account, click any sentence in a story and choose{' '}
          {'"write a variation"'}. Your version becomes a new branch alongside
          the original, and the rest of the story carries on after it, so
          readers can follow either.
        </p>
        <p>
          This is also how to change your own fragments once they exist in other{' '}
          {"users'"} stories.
        </p>
      </>
    ),
  },
  {
    question: 'How do I bookmark or "favourite" a story?',
    answer: (
      <>
        <p>
          Once you have an account you can add any story to your favourites.
          Simply click the {'"favourite"'} button at the bottom of the story.
        </p>
        <p>
          You can view all your favourites from your account page,{' '}
          <Link to="/account/favourites">here</Link>.
        </p>
      </>
    ),
  },
  {
    question: 'How do I link stories together?',
    answer: (
      <>
        <p>
          Stories can be linked to any existing fragment. Select the {'"Link"'}{' '}
          tab found at the top of the new fragment form. You can either search
          for the fragment you wish to connect to or navigate the tree using the{' '}
          {'"trace back"'} and {'"check ahead"'} buttons.
        </p>
        <p>
          Once you have found the fragment you are looking for, select it to
          link it to the current story.
        </p>
      </>
    ),
  },
  {
    question: 'Can I unlink stories?',
    answer: (
      <>
        <p>
          You can undo a link you have made between two fragments, but only
          until it used in another {"user's"} story.
        </p>
        <p>
          You can view all your links from your account page,{' '}
          <Link to="/account/links">here</Link>.
        </p>
      </>
    ),
  },
]

function FAQ() {
  return (
    <div className={styles.faq}>
      <h1>FAQ</h1>
      {CONTENT.map((c) => (
        <section key={c.question}>
          <h3>{c.question}</h3>
          {c.answer}
        </section>
      ))}
    </div>
  )
}
