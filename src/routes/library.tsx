import { createFileRoute } from '@tanstack/react-router'
import { SearchBox } from '../components/SearchBox.tsx'
import { Sort } from '../components/Sort.tsx'
import { StoryCards } from '../components/StoryCards.tsx'
import listStyles from '../components/ListPage.module.css'
import { listSearchSchema } from '../domain/search.ts'
import { SITE_TITLE } from '../lib/site.ts'
import { getLibrary } from '../server/fns/lists.ts'

const RESET = { page: undefined, after: undefined, before: undefined }

export const Route = createFileRoute('/library')({
  validateSearch: listSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) => getLibrary({ data: deps.search }),
  head: () => ({ meta: [{ title: `Library | ${SITE_TITLE}` }] }),
  component: Library,
})

function Library() {
  const page = Route.useLoaderData()
  const search = Route.useSearch()
  return (
    <div className={listStyles['list-page']}>
      <h1>Library</h1>
      <SearchBox label="Search by title" value={search.q} />
      {page.items.length > 1 || page.prev ? (
        <Sort
          current={search.order ?? 'popular'}
          defaultOrder="popular"
          reset={RESET}
        />
      ) : null}
      <StoryCards
        page={page}
        toSearch={(params) => ({
          ...RESET,
          ...params,
          order: params.order === 'popular' ? undefined : params.order,
        })}
      />
    </div>
  )
}
