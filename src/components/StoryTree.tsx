import { Link } from '@tanstack/react-router'
import type { Page } from '../domain/pagination.ts'
import type { Order } from '../domain/pagination.ts'
import type { StorySearch } from '../domain/search.ts'
import type { SessionUser } from '../server/auth/sessions.ts'
import type { ChildItem, LinkCandidate, Story } from '../server/data/stories.ts'
import { Pager } from './Pager.tsx'
import { Sort } from './Sort.tsx'
import { StoryText } from './StoryText.tsx'
import { Write } from './Write.tsx'
import styles from './StoryTree.module.css'

type Props = {
  story: Story
  childPage: Page<ChildItem>
  childCount: number
  link: Page<LinkCandidate> | null
  search: StorySearch
  user: SessionUser | null
}

const CHILD_PAGE_RESET = {
  page: undefined,
  after: undefined,
  before: undefined,
}

// A story (on the home page, an invitation) above, and the ways to continue it below; side
// by side on desktop
export const StoryTree = ({
  story,
  childPage,
  childCount,
  link,
  search,
  user,
}: Props) => {
  const order: Order = search.order ?? 'popular'
  return (
    <div className={styles.container}>
      <div className={`${styles.half} ${styles.top}`}>
        <div className={`${styles.content} ${styles.page}`}>
          {story.isRoot ? (
            <p className={styles.begin}>
              (choose a beginning, start a new story, or{' '}
              <Link to="/library">visit the library</Link>)
            </p>
          ) : (
            <StoryText story={story} user={user} />
          )}
        </div>
      </div>
      <div className={`${styles.half} ${styles.bottom}`}>
        <div className={styles.content}>
          {childCount > 1 ? (
            <Sort
              current={order}
              defaultOrder="popular"
              reset={CHILD_PAGE_RESET}
            />
          ) : null}
          {childPage.items.length ? (
            <ul className={styles.children}>
              {childPage.items.map((child) => (
                <li key={child.key}>
                  <div className={styles.card}>
                    <p>
                      <Link to={child.permalink}>{child.content}</Link>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.end}>
              {story.isRoot
                ? null
                : "(tale's end. write more or link to another)"}
            </p>
          )}
          <Pager
            page={childPage}
            toSearch={(params) => ({
              ...CHILD_PAGE_RESET,
              ...params,
              order: params.order === 'popular' ? undefined : params.order,
            })}
          />
          <Write story={story} user={user} search={search} link={link} />
        </div>
      </div>
    </div>
  )
}
