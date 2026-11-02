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
  const { graph, path, prefixes, extensions, permalink, title } =
    Route.useLoaderData()
  return (
    <div className={styles.page}>
      {/* One map that grows as you move around it, full height like the
          story's book, with the story's title inside it */}
      <StoryMap
        graph={graph}
        story={{ path, prefixes, extensions }}
        title={title}
        tab={
          <Link to={permalink} className="book-tab">
            (story)
          </Link>
        }
      />
    </div>
  )
}
