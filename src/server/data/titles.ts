import { sql } from 'kysely'
import { ActionError } from '../../domain/errors.ts'
import {
  PAGE_SIZE,
  type Page,
  type PageParams,
} from '../../domain/pagination.ts'
import { titleToSlug, validateTitle } from '../../domain/slug.ts'
import type { Db } from '../db/index.ts'
import {
  keysetPage,
  keysetQuery,
  popularOffset,
  popularPage,
  searchPattern,
} from './paging.ts'
import { ensurePath } from './paths.ts'
import { type Author, requireStory } from './sentences.ts'
import { type StorySummary, summarisePaths } from './summaries.ts'
import { last } from '../../domain/present.ts'

// Titles a story, adding it to the library. Only the author of the story's
// last sentence may title it.
export const setTitle = async (
  trx: Db,
  viewer: Author,
  input: { story: string; title: string },
) => {
  const error = validateTitle(input.title)
  if (error) {
    throw new ActionError('invalid', error)
  }
  const title = input.title.trim()
  const slug = titleToSlug(title)
  const { sentenceIds } = await requireStory(trx, input.story)
  const leaf = await trx
    .selectFrom('sentences')
    .select(['author_id', 'deleted_at'])
    .where('id', '=', last(sentenceIds))
    .executeTakeFirstOrThrow()
  if (leaf.deleted_at || leaf.author_id !== viewer.id) {
    throw new ActionError('forbidden')
  }
  const pathId = await ensurePath(trx, sentenceIds)
  const taken = await trx
    .selectFrom('titles')
    .select('path_id')
    .where('slug', '=', slug)
    .where('path_id', '<>', pathId)
    .executeTakeFirst()
  if (taken) {
    throw new ActionError('duplicate', 'That title is taken')
  }
  await trx
    .insertInto('titles')
    .values({ path_id: pathId, title, slug, author_id: viewer.id })
    .onConflict((oc) =>
      // A new title counts as new, for the digest
      oc.column('path_id').doUpdateSet({
        title,
        slug,
        author_id: viewer.id,
        created_at: new Date(),
      }),
    )
    .execute()
  return { slug }
}

// Titled stories, optionally only those titled by one writer
export const library = async (
  db: Db,
  params: PageParams,
  search?: string,
  { authorId }: { authorId?: number } = {},
): Promise<Page<StorySummary>> => {
  let query = db.selectFrom('titles as t').select(['t.path_id', 't.title'])
  if (authorId !== undefined) {
    query = query.where('t.author_id', '=', authorId)
  }
  if (search) {
    query = query.where('t.title', 'ilike', searchPattern(search))
  }
  let page: Page<{ path_id: number; title: string }>
  if (params.order === 'popular') {
    const rows = await query
      .orderBy(
        sql`(select count(*) from app.likes l where l.path_id = t.path_id)`,
        'desc',
      )
      .orderBy('t.path_id')
      .limit(PAGE_SIZE + 1)
      .offset(popularOffset(params.page))
      .execute()
    page = popularPage(rows, params.page ?? 1)
  } else {
    const { cursor, op, direction } = keysetQuery(params)
    if (cursor) {
      query = query.where('t.path_id', op, cursor)
    }
    const rows = await query
      .orderBy('t.path_id', direction)
      .limit(PAGE_SIZE + 1)
      .execute()
    page = keysetPage(rows, params, (r) => r.path_id)
  }
  return {
    ...page,
    items: await summarisePaths(
      db,
      page.items.map((r) => ({ pathId: r.path_id, title: r.title })),
      { firstOnly: true },
    ),
  }
}
