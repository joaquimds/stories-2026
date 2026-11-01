import { Link } from '@tanstack/react-router'
import type { Page, PageParams } from '../domain/pagination.ts'
import { Pager } from './Pager.tsx'
import styles from './SentenceList.module.css'

type Item = { id: number; text: string; permalink: string }

type Props = {
  page: Page<Item>
  toSearch: (params: PageParams) => Record<string, unknown>
}

export const SentenceList = ({ page, toSearch }: Props) =>
  page.items.length ? (
    <>
      <ul className={styles.list}>
        {page.items.map((item) => (
          <li key={item.id} className={styles.sentence}>
            <p>
              <Link to={item.permalink}>{item.text}</Link>
            </p>
          </li>
        ))}
      </ul>
      <Pager page={page} toSearch={toSearch} />
    </>
  ) : (
    <p className={styles.info}>(no results)</p>
  )
