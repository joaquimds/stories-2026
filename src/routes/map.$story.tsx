import { Link, createFileRoute } from '@tanstack/react-router'
import { StoryMap } from '../components/StoryMap.tsx'
import { SITE_TITLE } from '../lib/site.ts'
import { getMap } from '../server/fns/stories.ts'
import styles from './map.module.css'

// The branches around a story
export const Route = createFileRoute('/map/$story')({
  loader: ({ params }) => getMap({ data: { story: params.story } }),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `Map${loaderData?.title ? ` of ${loaderData.title}` : ''} | ${SITE_TITLE}`,
      },
    ],
  }),
  component: MapPage,
})

function MapPage() {
  const { nodes, permalink, title } = Route.useLoaderData()
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>{title ? `Map of ${title}` : 'Map'}</h1>
        <Link to={permalink}>(back to the story)</Link>
      </div>
      {/* A fresh map for each story; the same story's data arriving again
          keeps it */}
      <StoryMap key={permalink} nodes={nodes} />
    </div>
  )
}
