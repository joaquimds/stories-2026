import { createFileRoute, redirect } from '@tanstack/react-router'
import { StoryTree } from '../components/StoryTree.tsx'
import { storySearchSchema } from '../domain/search.ts'
import { ROOT_THREAD } from '../domain/thread.ts'
import { SITE_DESCRIPTION, SITE_TITLE } from '../lib/site.ts'
import { getStoryPage } from '../server/fns/stories.ts'

export const Route = createFileRoute('/s/$story')({
  validateSearch: storySearchSchema,
  beforeLoad: ({ params, search }) => {
    if (params.story === ROOT_THREAD) {
      throw redirect({ to: '/', search, statusCode: 301 })
    }
  },
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ params, deps }) =>
    getStoryPage({ data: { story: params.story, search: deps.search } }),
  head: ({ loaderData, match }) => {
    const story = loaderData?.story
    if (!story) {
      return {}
    }
    const { siteUrl } = match.context
    const title = story.title ? `${story.title} | ${SITE_TITLE}` : SITE_TITLE
    const description =
      story.lines.find((l) => !l.deleted)?.content ?? SITE_DESCRIPTION
    const url = `${siteUrl}${story.permalink}`
    const image = `${siteUrl}/og/${encodeURIComponent(story.permalink.replace(/^\/s\//, ''))}`
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: url },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { property: 'og:image', content: image },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { name: 'twitter:image', content: image },
        { name: 'twitter:card', content: 'summary_large_image' },
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
