import { createFileRoute } from '@tanstack/react-router'
import { StoryTree } from '../components/StoryTree.tsx'
import { storySearchSchema } from '../domain/search.ts'
import { getStoryPage } from '../server/fns/stories.ts'

export const Route = createFileRoute('/')({
  validateSearch: storySearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) =>
    getStoryPage({ data: { story: null, search: deps.search } }),
  component: Home,
})

function Home() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const { user } = Route.useRouteContext()
  return (
    <StoryTree
      story={null}
      childPage={data.children.page}
      childCount={data.children.count}
      link={null}
      search={search}
      user={user}
    />
  )
}
