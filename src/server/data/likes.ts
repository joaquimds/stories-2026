import { sql } from 'kysely'
import {
  PAGE_SIZE,
  type Page,
  type PageParams,
} from '../../domain/pagination.ts'
import { ActionError } from '../../domain/errors.ts'
import { ROOT_ID } from '../../domain/thread.ts'
import type { Db } from '../db/index.ts'
import { keysetPage, keysetQuery, searchPattern } from './paging.ts'
import { ensurePath, resolvePath } from './paths.ts'
import { type Author, requireStory } from './sentences.ts'
import { type StorySummary, summarisePaths } from './summaries.ts'

export const setLike = async (
  trx: Db,
  viewer: Author,
  input: { story: string; liked: boolean },
) => {
  const { sentenceIds } = await requireStory(trx, input.story)
  if (sentenceIds.at(-1) === ROOT_ID) {
    throw new ActionError('invalid')
  }
  if (input.liked) {
    const pathId = await ensurePath(trx, sentenceIds)
    await trx
      .insertInto('likes')
      .values({ user_id: viewer.id, path_id: pathId })
      .onConflict((oc) => oc.columns(['user_id', 'path_id']).doNothing())
      .execute()
  } else {
    const { pathId } = await resolvePath(trx, sentenceIds)
    if (pathId) {
      await trx
        .deleteFrom('likes')
        .where('user_id', '=', viewer.id)
        .where('path_id', '=', pathId)
        .execute()
    }
  }
  return { liked: input.liked }
}

// Stories the viewer liked, most recent first
export const favourites = async (
  db: Db,
  viewer: Author,
  params: Extract<PageParams, { order: 'newest' | 'oldest' }>,
  search?: string,
): Promise<Page<StorySummary>> => {
  const { cursor, direction } = keysetQuery(params)
  const forward = direction === 'desc'
  let query = db
    .selectFrom('likes as l')
    .innerJoin('paths as p', 'p.id', 'l.path_id')
    .innerJoin('sentences as s', 's.id', 'p.sentence_id')
    .leftJoin('titles as t', 't.path_id', 'l.path_id')
    .select(['l.path_id', 'l.created_at', 't.title'])
    .where('l.user_id', '=', viewer.id)
  if (search) {
    const pattern = searchPattern(search)
    query = query.where((eb) =>
      eb.or([
        eb('t.title', 'ilike', pattern),
        eb('s.content', 'ilike', pattern),
      ]),
    )
  }
  if (cursor) {
    // Likes have no id, so the cursor is the liked path and rows are
    // ordered by when they were liked
    const at = sql`(select created_at, path_id from app.likes
      where user_id = ${viewer.id} and path_id = ${cursor})`
    query = query.where(
      sql<boolean>`(l.created_at, l.path_id) ${sql.raw(forward ? '<' : '>')} ${at}`,
    )
  }
  const rows = await query
    .orderBy('l.created_at', direction)
    .orderBy('l.path_id', direction)
    .limit(PAGE_SIZE + 1)
    .execute()
  const page = keysetPage(rows, params, (r) => r.path_id)
  return {
    ...page,
    items: await summarisePaths(
      db,
      page.items.map((r) => ({ pathId: r.path_id, title: r.title })),
    ),
  }
}
