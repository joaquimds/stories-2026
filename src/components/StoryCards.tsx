import { Link } from '@tanstack/react-router'
import type { Page, PageParams } from '../domain/pagination.ts'
import type { StorySummary } from '../server/data/summaries.ts'
import { Pager } from './Pager.tsx'
import styles from './StoryCards.module.css'

type Props = {
  page: Page<StorySummary>
  toSearch: (params: PageParams) => Record<string, unknown>
}

export const StoryCards = ({ page, toSearch }: Props) =>
  page.items.length ? (
    <>
      <ul className={styles.list}>
        {page.items.map((story) => (
          <li key={story.pathId} className={`${styles.story} link-card`}>
            {story.title ? <h2>{story.title}</h2> : null}
            <p>
              <Link to={story.permalink} className="card-link">
                {story.keySentences.join(' → ')}
              </Link>
            </p>
          </li>
        ))}
      </ul>
      <Pager page={page} toSearch={toSearch} />
    </>
  ) : (
    <p className={styles.info}>(no results)</p>
  )
