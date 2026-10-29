import { createFileRoute } from '@tanstack/react-router'
import listStyles from '../../components/ListPage.module.css'
import { SearchBox } from '../../components/SearchBox.tsx'
import { SentenceList } from '../../components/SentenceList.tsx'
import { cursorSearch } from '../../domain/pagination.ts'
import { listSearchSchema } from '../../domain/search.ts'
import { SITE_TITLE } from '../../lib/site.ts'
import { getLinks } from '../../server/fns/lists.ts'

export const Route = createFileRoute('/account/links')({
  validateSearch: listSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) => getLinks({ data: deps.search }),
  head: () => ({ meta: [{ title: `Your Links | ${SITE_TITLE}` }] }),
  component: Links,
})

function Links() {
  const page = Route.useLoaderData()
  const search = Route.useSearch()
  return (
    <div className={listStyles['list-page']}>
      <h1>Your Links</h1>
      <SearchBox label="Search" value={search.q} />
      <SentenceList
        page={{
          ...page,
          items: page.items.map((l) => ({
            ...l,
            text: `${l.fromContent} → ${l.toContent}`,
          })),
        }}
        toSearch={cursorSearch}
      />
    </div>
  )
}
