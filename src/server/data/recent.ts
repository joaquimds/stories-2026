import { sql } from 'kysely'
import {
  PAGE_SIZE,
  type Page,
  type PageParams,
} from '../../domain/pagination.ts'
import { ROOT_ID } from '../../domain/thread.ts'
import type { Db } from '../db/index.ts'
import { keysetPage, keysetQuery } from './paging.ts'
import { pathPermalinks } from './paths.ts'

export type RecentItem = {
  id: number
  content: string
  authorName: string
  // The sentence it was written after, for context; null for a beginning
  previous: string | null
  permalink: string
  createdAt: string
}

// Sentences across the whole site, linked to where they were written. With
// `looseEnds`, only those that nothing follows yet.
export const recentSentences = async (
  db: Db,
  params: Extract<PageParams, { order: 'newest' | 'oldest' }>,
  { looseEnds = false } = {},
): Promise<Page<RecentItem>> => {
  const { cursor, op, direction } = keysetQuery(params)
  let query = db
    .selectFrom('sentences as s')
    .innerJoin('users as u', 'u.id', 's.author_id')
    .innerJoin('paths as origin', (join) =>
      join
        .onRef('origin.sentence_id', '=', 's.id')
        .on(
          sql<boolean>`origin.parent_id is not distinct from s.written_under_path_id`,
        ),
    )
    .innerJoin('paths as under', 'under.id', 's.written_under_path_id')
    .innerJoin('sentences as prev', 'prev.id', 'under.sentence_id')
    .select([
      's.id',
      's.content',
      's.created_at',
      'u.name',
      'origin.id as origin_path_id',
      'prev.id as prev_id',
      'prev.content as prev_content',
      'prev.deleted_at as prev_deleted_at',
    ])
    .where('s.deleted_at', 'is', null)
  if (looseEnds) {
    query = query.where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom('links as l')
            .innerJoin('sentences as c', 'c.id', 'l.to_sentence_id')
            .select('l.id')
            .whereRef('l.from_sentence_id', '=', 's.id')
            .where('c.deleted_at', 'is', null),
        ),
      ),
    )
  }
  if (cursor) {
    query = query.where('s.id', op, cursor)
  }
  const rows = await query
    .orderBy('s.id', direction)
    .limit(PAGE_SIZE + 1)
    .execute()
  const page = keysetPage(rows, params, (r) => r.id)
  const permalinks = await pathPermalinks(
    db,
    page.items.map((r) => r.origin_path_id),
  )
  return {
    ...page,
    items: page.items.map((r) => ({
      id: r.id,
      content: r.content,
      authorName: r.name,
      previous:
        r.prev_id === ROOT_ID
          ? null
          : r.prev_deleted_at
            ? '[deleted]'
            : r.prev_content,
      permalink: permalinks.get(r.origin_path_id)?.permalink ?? '/',
      createdAt: r.created_at.toISOString(),
    })),
  }
}
