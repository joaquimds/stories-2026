import { createFileRoute } from '@tanstack/react-router'
import listStyles from '../../components/ListPage.module.css'
import { SearchBox } from '../../components/SearchBox.tsx'
import { StoryCards } from '../../components/StoryCards.tsx'
import { cursorSearch } from '../../domain/pagination.ts'
import { listSearchSchema } from '../../domain/search.ts'
import { SITE_TITLE } from '../../lib/site.ts'
import { getFavourites } from '../../server/fns/lists.ts'

export const Route = createFileRoute('/account/favourites')({
  validateSearch: listSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) => getFavourites({ data: deps.search }),
  head: () => ({ meta: [{ title: `Your Favourites | ${SITE_TITLE}` }] }),
  component: Favourites,
})

function Favourites() {
  const page = Route.useLoaderData()
  const search = Route.useSearch()
  return (
    <div className={listStyles['list-page']}>
      <h1>Your Favourites</h1>
      <SearchBox label="Search" value={search.q} />
      <StoryCards page={page} toSearch={cursorSearch} />
    </div>
  )
}
