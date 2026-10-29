import { sql } from 'kysely'
import { ActionError } from '../../domain/errors.ts'
import type { Page, PageParams } from '../../domain/pagination.ts'
import { PAGE_SIZE } from '../../domain/pagination.ts'
import type { Db } from '../db/index.ts'
import { keysetPage, keysetQuery, searchPattern } from './paging.ts'
import {
  encodeThreads,
  ensurePath,
  pathSentenceIds,
  permalink,
} from './paths.ts'
import { isStepProtected } from './rules.ts'
import { type Author, maskContent, requireStory } from './sentences.ts'
import { leafStep } from './stories.ts'

// Links an existing sentence as a child of the story's last sentence
export const linkSentence = async (
  trx: Db,
  viewer: Author,
  input: { story: string; sentenceId: number },
) => {
  const resolved = await requireStory(trx, input.story)
  const leaf = resolved.sentenceIds.at(-1) as number
  const child = await trx
    .selectFrom('sentences')
    .select('deleted_at')
    .where('id', '=', input.sentenceId)
    .executeTakeFirst()
  if (!child || child.deleted_at) {
    throw new ActionError('notFound')
  }
  const inserted = await trx
    .insertInto('links')
    .values({
      from_sentence_id: leaf,
      to_sentence_id: input.sentenceId,
      author_id: viewer.id,
    })
    .onConflict((oc) =>
      oc.columns(['from_sentence_id', 'to_sentence_id']).doNothing(),
    )
    .returning('id')
    .executeTakeFirst()
  const ids = [...resolved.sentenceIds, input.sentenceId]
  if (inserted) {
    await ensurePath(trx, ids)
  }
  const [thread] = await encodeThreads(trx, [ids])
  return { thread: thread as string }
}

// Removes the link the viewer made into the story's last sentence, along
// with the paths that take it, unless others have built on it.
export const unlinkSentence = async (
  trx: Db,
  viewer: Author,
  story: string,
) => {
  const resolved = await requireStory(trx, story)
  const step = leafStep(resolved)
  if (!step) {
    throw new ActionError('invalid')
  }
  const link = await trx
    .selectFrom('links')
    .select(['id', 'author_id'])
    .where('from_sentence_id', '=', step.parent)
    .where('to_sentence_id', '=', step.leaf)
    .forUpdate()
    .executeTakeFirst()
  if (!link) {
    throw new ActionError('notFound')
  }
  if (link.author_id !== viewer.id) {
    throw new ActionError('forbidden')
  }
  if (await isStepProtected(trx, step.parent, step.leaf, viewer.id)) {
    throw new ActionError('forbidden')
  }
  await sql`
    delete from app.paths p using app.paths parent
    where p.parent_id = parent.id
      and parent.sentence_id = ${step.parent}
      and p.sentence_id = ${step.leaf}
  `.execute(trx)
  await trx.deleteFrom('links').where('id', '=', link.id).execute()
  const [parentThread] = await encodeThreads(trx, [
    resolved.sentenceIds.slice(0, -1),
  ])
  return { parentThread: parentThread as string }
}

export type LinkItem = {
  id: number
  fromContent: string
  toContent: string
  permalink: string
}

// Links the viewer made, oldest first
export const myLinks = async (
  db: Db,
  viewer: Author,
  params: Extract<PageParams, { order: 'newest' | 'oldest' }>,
  search?: string,
): Promise<Page<LinkItem>> => {
  const { cursor, op, direction } = keysetQuery(params)
  let query = db
    .selectFrom('links as l')
    .innerJoin('sentences as f', 'f.id', 'l.from_sentence_id')
    .innerJoin('sentences as t', 't.id', 'l.to_sentence_id')
    .innerJoin('paths as origin', (join) =>
      join
        .onRef('origin.sentence_id', '=', 'f.id')
        .on(
          sql<boolean>`origin.parent_id is not distinct from f.written_under_path_id`,
        ),
    )
    .select([
      'l.id',
      'l.to_sentence_id',
      'origin.id as origin_path_id',
      'f.content as from_content',
      'f.deleted_at as from_deleted_at',
      't.content as to_content',
      't.deleted_at as to_deleted_at',
    ])
    .where('l.author_id', '=', viewer.id)
  if (search) {
    const pattern = searchPattern(search)
    query = query.where((eb) =>
      eb.or([
        eb('f.content', 'ilike', pattern),
        eb('t.content', 'ilike', pattern),
      ]),
    )
  }
  if (cursor) {
    query = query.where('l.id', op, cursor)
  }
  const rows = await query
    .orderBy('l.id', direction)
    .limit(PAGE_SIZE + 1)
    .execute()
  const page = keysetPage(rows, params, (r) => r.id)
  const origins = await pathSentenceIds(
    db,
    page.items.map((r) => r.origin_path_id),
  )
  const threads = await encodeThreads(
    db,
    page.items.map((r) => [
      ...(origins.get(r.origin_path_id) ?? []),
      r.to_sentence_id,
    ]),
  )
  return {
    ...page,
    items: page.items.map((r, i) => ({
      id: r.id,
      fromContent: maskContent(r.from_content, r.from_deleted_at),
      toContent: maskContent(r.to_content, r.to_deleted_at),
      permalink: permalink(threads[i] as string),
    })),
  }
}
