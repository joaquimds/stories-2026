import { Link } from '@tanstack/react-router'
import type { Page, PageParams } from '../domain/pagination.ts'
import styles from './Pager.module.css'

type Props = {
  page: Pick<Page<unknown>, 'prev' | 'next' | 'truncated'>
  // Search params for a page, merged into the current ones
  toSearch: (params: PageParams) => Record<string, unknown>
}

export const Pager = ({ page, toSearch }: Props) => {
  const { prev: before, next: after } = page
  if (!before && !after && !page.truncated) {
    return null
  }
  return (
    <div className={styles.pager}>
      {before ? (
        <span className="aside">
          (
          <Link
            to="."
            search={(prev: object) => ({ ...prev, ...toSearch(before) })}
            rel="prev"
          >
            previous
          </Link>
          )
        </span>
      ) : (
        <span />
      )}
      {after ? (
        <span className="aside">
          (
          <Link
            to="."
            search={(prev: object) => ({ ...prev, ...toSearch(after) })}
            rel="next"
          >
            next
          </Link>
          )
        </span>
      ) : (
        <span />
      )}
      {page.truncated ? (
        <p className={styles.note}>
          (showing the top 100; sort by newest or search to find more)
        </p>
      ) : null}
    </div>
  )
}
