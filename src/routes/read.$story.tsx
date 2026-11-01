import { Link, createFileRoute } from '@tanstack/react-router'
import { Authors } from '../components/Authors.tsx'
import { SITE_TITLE } from '../lib/site.ts'
import { getStoryText } from '../server/fns/stories.ts'
import styles from './read.module.css'

// A story as continuous prose, without the panels; also prints cleanly
export const Route = createFileRoute('/read/$story')({
  loader: ({ params }) => getStoryText({ data: { story: params.story } }),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.title
          ? `${loaderData.title} | ${SITE_TITLE}`
          : SITE_TITLE,
      },
    ],
  }),
  component: Read,
})

function Read() {
  const { title, permalink, sentences, authors } = Route.useLoaderData()
  return (
    <article className={styles.piece}>
      {title ? <h1>{title}</h1> : null}
      <p className={styles.prose}>{sentences.join(' ')}</p>
      <Authors authors={authors} className={styles.byline} />
      <p className={styles.back}>
        <Link to={permalink}>(back to the story)</Link>
      </p>
    </article>
  )
}
