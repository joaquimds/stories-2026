import { Link, createFileRoute } from '@tanstack/react-router'
import { SITE_TITLE } from '../lib/site.ts'
import { getStatsPage } from '../server/fns/lists.ts'
import styles from './stats.module.css'

export const Route = createFileRoute('/stats')({
  loader: () => getStatsPage(),
  head: () => ({ meta: [{ title: `Stats | ${SITE_TITLE}` }] }),
  component: Stats,
})

function Stats() {
  const stats = Route.useLoaderData()
  const totals = [
    ['Fragments', stats.sentences],
    ['Writers', stats.writers],
    ['Favourites', stats.likes],
    ['Titled stories', stats.titledStories],
  ] as const
  const recent = [
    ['Last 7 days', stats.sentencesLastWeek],
    ['Last 30 days', stats.sentencesLastMonth],
  ] as const
  const max = Math.max(1, ...recent.map(([, n]) => n))
  return (
    <div className={styles.stats}>
      <h1>Stats</h1>
      <table className={styles.table}>
        <tbody>
          {totals.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Fragments written</h2>
      <table className={styles.table}>
        <tbody>
          {recent.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value}</td>
              <td className={styles['bar-cell']}>
                <span
                  className={styles.bar}
                  style={{ width: `${(value / max) * 100}%` }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Records</h2>
      <dl className={styles.records}>
        <dt>The longest story</dt>
        <dd>
          {stats.longestStory ? (
            <Link to={stats.longestStory.permalink}>
              {stats.longestStory.length} fragments
            </Link>
          ) : (
            '(none yet)'
          )}
        </dd>
        <dt>The most-branched fragment</dt>
        <dd>
          {stats.mostBranched ? (
            <>
              <Link to={stats.mostBranched.permalink}>
                {stats.mostBranched.content}
              </Link>{' '}
              ({stats.mostBranched.children} continuations)
            </>
          ) : (
            '(none yet)'
          )}
        </dd>
        <dt>The most favourited story</dt>
        <dd>
          {stats.mostLiked ? (
            <>
              <Link to={stats.mostLiked.permalink}>
                {stats.mostLiked.title ?? '(untitled)'}
              </Link>{' '}
              ({stats.mostLiked.likes} favourites)
            </>
          ) : (
            '(none yet)'
          )}
        </dd>
        <dt>Loops in the tree</dt>
        <dd>{stats.loops}</dd>
      </dl>
      <p className={styles.updated}>
        Updated {new Date(stats.computedAt).toUTCString().replace('GMT', 'UTC')}
      </p>
    </div>
  )
}
