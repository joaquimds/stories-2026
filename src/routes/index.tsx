import { createFileRoute } from '@tanstack/react-router'
import { StoryTree } from '../components/StoryTree.tsx'
import { storySearchSchema } from '../domain/search.ts'
import { ROOT_THREAD } from '../domain/thread.ts'
import { getStoryPage } from '../server/fns/stories.ts'

// The home page is the root's story: its children are the beginnings
export const Route = createFileRoute('/')({
  validateSearch: storySearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) =>
    getStoryPage({ data: { story: ROOT_THREAD, search: deps.search } }),
  component: Home,
})

function Home() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const { user } = Route.useRouteContext()
  return (
    <StoryTree
      story={data.story}
      childPage={data.children.page}
      childCount={data.children.count}
      link={data.link}
      search={search}
      user={user}
    />
  )
}
