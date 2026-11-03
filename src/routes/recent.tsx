import { Link, createFileRoute } from '@tanstack/react-router'
import { AuthorLink } from '../components/Authors.tsx'
import listStyles from '../components/ListPage.module.css'
import { Pager } from '../components/Pager.tsx'
import sortStyles from '../components/Sort.module.css'
import { cursorSearch } from '../domain/pagination.ts'
import { recentSearchSchema } from '../domain/search.ts'
import { SITE_TITLE } from '../lib/site.ts'
import { getRecent } from '../server/fns/lists.ts'
import styles from './recent.module.css'

export const Route = createFileRoute('/recent')({
  validateSearch: recentSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) => getRecent({ data: deps.search }),
  head: () => ({ meta: [{ title: `Recent | ${SITE_TITLE}` }] }),
  component: Recent,
})

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

function Recent() {
  const page = Route.useLoaderData()
  const { loose } = Route.useSearch()
  return (
    <div className={listStyles['list-page']}>
      <h1>Recent</h1>
      <div className={sortStyles.sort}>
        <Link to="/recent" className={`link ${loose ? '' : 'current'}`}>
          All
        </Link>
        <Link
          to="/recent"
          search={{ loose: true }}
          className={`link ${loose ? 'current' : ''}`}
        >
          Loose ends
        </Link>
      </div>
      {page.items.length ? (
        <>
          <ul className={styles.list}>
            {page.items.map((item) => (
              <li key={item.id} className={`${styles.item} link-card`}>
                {item.previous ? (
                  <p className={styles.previous}>… {item.previous}</p>
                ) : null}
                <p className={styles.content}>
                  <Link to={item.permalink} className="card-link">
                    {item.content}
                  </Link>
                </p>
                <p className={styles.meta}>
                  <AuthorLink name={item.authorName} />,{' '}
                  {formatDate(item.createdAt)}
                </p>
              </li>
            ))}
          </ul>
          <Pager page={page} toSearch={cursorSearch} />
        </>
      ) : (
        <p className={styles.note}>(no results)</p>
      )}
    </div>
  )
}
