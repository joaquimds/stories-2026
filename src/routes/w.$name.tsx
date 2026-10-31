import { Link, createFileRoute } from '@tanstack/react-router'
import listStyles from '../components/ListPage.module.css'
import { SentenceList } from '../components/SentenceList.tsx'
import sortStyles from '../components/Sort.module.css'
import { StoryCards } from '../components/StoryCards.tsx'
import { cursorSearch } from '../domain/pagination.ts'
import { AUTHOR_TABS, authorSearchSchema } from '../domain/search.ts'
import { SITE_TITLE } from '../lib/site.ts'
import { getAuthorPage } from '../server/fns/authors.ts'
import styles from './w.module.css'

const TAB_LABELS = {
  fragments: 'Fragments',
  titled: 'Titled',
  favourites: 'Favourites',
} satisfies Record<(typeof AUTHOR_TABS)[number], string>

// A writer's page, by pen name
export const Route = createFileRoute('/w/$name')({
  validateSearch: authorSearchSchema,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ params, deps }) =>
    getAuthorPage({ data: { name: params.name, search: deps.search } }),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `${loaderData.author.name} | ${SITE_TITLE}`
          : SITE_TITLE,
      },
    ],
  }),
  component: Author,
})

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`

function Author() {
  const { author, tab, stories, fragments } = Route.useLoaderData()
  const since = new Date(author.since).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return (
    <div className={listStyles['list-page']}>
      <h1>{author.name}</h1>
      <p className={styles.summary}>
        Writing since {since}: {plural(author.sentences, 'fragment')},{' '}
        {plural(author.titles, 'titled story').replace('storys', 'stories')}.
      </p>
      <div className={sortStyles.sort}>
        {AUTHOR_TABS.map((value) => (
          <Link
            key={value}
            to="/w/$name"
            params={{ name: author.name }}
            search={value === 'fragments' ? {} : { tab: value }}
            className={`link ${tab === value ? 'current' : ''}`}
            replace
          >
            {TAB_LABELS[value]}
          </Link>
        ))}
      </div>
      {fragments ? (
        <SentenceList
          page={{
            ...fragments,
            items: fragments.items.map((f) => ({ ...f, text: f.content })),
          }}
          toSearch={cursorSearch}
        />
      ) : stories ? (
        <StoryCards page={stories} toSearch={cursorSearch} />
      ) : null}
    </div>
  )
}
