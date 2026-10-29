import { createFileRoute } from '@tanstack/react-router'
import listStyles from '../../components/ListPage.module.css'
import { SearchBox } from '../../components/SearchBox.tsx'
import { SentenceList } from '../../components/SentenceList.tsx'
import { cursorSearch } from '../../domain/pagination.ts'
import { listSearchSchema } from '../../domain/search.ts'
import { SITE_TITLE } from '../../lib/site.ts'
import { getFragments } from '../../server/fns/lists.ts'

export const Route = createFileRoute('/account/fragments')({
  validateSearch: listSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) => getFragments({ data: deps.search }),
  head: () => ({ meta: [{ title: `Your Fragments | ${SITE_TITLE}` }] }),
  component: Fragments,
})

function Fragments() {
  const page = Route.useLoaderData()
  const search = Route.useSearch()
  return (
    <div className={listStyles['list-page']}>
      <h1>Your Fragments</h1>
      <SearchBox label="Search" value={search.q} />
      <SentenceList
        page={{
          ...page,
          items: page.items.map((f) => ({ ...f, text: f.content })),
        }}
        toSearch={cursorSearch}
      />
    </div>
  )
}
