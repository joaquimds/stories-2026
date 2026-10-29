import { createFileRoute } from '@tanstack/react-router'
import { StoryTree } from '../components/StoryTree.tsx'
import { storySearchSchema } from '../domain/search.ts'
import { SITE_DESCRIPTION, SITE_TITLE } from '../lib/site.ts'
import { getStoryPage } from '../server/fns/stories.ts'

export const Route = createFileRoute('/s/$story')({
  validateSearch: storySearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ params, deps }) =>
    getStoryPage({ data: { story: params.story, search: deps.search } }),
  head: ({ loaderData, match }) => {
    const story = loaderData?.story
    if (!story) {
      return {}
    }
    const siteUrl = (match.context as { siteUrl?: string }).siteUrl ?? ''
    const title = story.title ? `${story.title} | ${SITE_TITLE}` : SITE_TITLE
    const description =
      story.lines.find((l) => !l.deleted)?.content ?? SITE_DESCRIPTION
    const url = `${siteUrl}${story.permalink}`
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: url },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
      ],
      links: [{ rel: 'canonical', href: url }],
    }
  },
  component: StoryPage,
})

function StoryPage() {
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
