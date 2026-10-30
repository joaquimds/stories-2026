import { sql } from 'kysely'
import { ActionError } from '../../domain/errors.ts'
import { ROOT_ID } from '../../domain/thread.ts'
import {
  PAGE_SIZE,
  type Page,
  type PageParams,
} from '../../domain/pagination.ts'
import type { Db } from '../db/index.ts'
import { keysetPage, keysetQuery, searchPattern } from './paging.ts'
import {
  encodeThreads,
  ensurePath,
  pathPermalinks,
  resolveStory,
} from './paths.ts'
import { editableSentences } from './rules.ts'

export const DELETED = '[deleted]'

export type Author = { id: number; name: string }

export type SentenceRow = {
  id: number
  content: string
  deleted: boolean
  author: Author | null
}

// Sentences by id, with deleted content masked
export const loadSentences = async (
  db: Db,
  sentenceIds: number[],
): Promise<Map<number, SentenceRow>> => {
  const ids = [...new Set(sentenceIds)]
  if (!ids.length) {
    return new Map()
  }
  const rows = await db
    .selectFrom('sentences as s')
    .leftJoin('users as u', 'u.id', 's.author_id')
    .select(['s.id', 's.content', 's.deleted_at', 's.author_id', 'u.name'])
    .where('s.id', 'in', ids)
    .execute()
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        content: r.deleted_at ? DELETED : r.content,
        deleted: Boolean(r.deleted_at),
        author:
          r.deleted_at || r.author_id === null || r.name === null
            ? null
            : { id: r.author_id, name: r.name },
      },
    ]),
  )
}

export const maskContent = (content: string, deletedAt: Date | null) =>
  deletedAt ? DELETED : content

export const MAX_CONTENT_LENGTH = 280

export const normaliseContent = (content: string) => {
  const trimmed = content.trim()
  if (!trimmed || trimmed.length > MAX_CONTENT_LENGTH) {
    throw new ActionError('invalid')
  }
  return trimmed
}

export const requireStory = async (db: Db, story: string) => {
  const resolved = await resolveStory(db, story)
  if (!resolved) {
    throw new ActionError('notFound')
  }
  return resolved
}

const insertSentence = async (
  trx: Db,
  authorId: number,
  content: string,
  parentIds: number[],
) => {
  const parentPathId = await ensurePath(trx, parentIds)
  const { id } = await trx
    .insertInto('sentences')
    .values({
      content,
      author_id: authorId,
      written_under_path_id: parentPathId,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await trx
    .insertInto('links')
    .values({
      from_sentence_id: parentIds.at(-1) as number,
      to_sentence_id: id,
      author_id: null,
    })
    .execute()
  await trx
    .insertInto('paths')
    .values({ parent_id: parentPathId, sentence_id: id })
    .execute()
  return id
}

// Writes a sentence continuing `story`; at the root, a new beginning
export const writeSentence = async (
  trx: Db,
  viewer: Author,
  story: string,
  content: string,
) => {
  const { sentenceIds: parentIds } = await requireStory(trx, story)
  const id = await insertSentence(
    trx,
    viewer.id,
    normaliseContent(content),
    parentIds,
  )
  const [thread] = await encodeThreads(trx, [[...parentIds, id]])
  return { thread: thread as string }
}

// Edits the sentence at `index` in a story: in place when the viewer wrote
// it and it is still editable, otherwise as a new branch alongside it that
// continues with the rest of the story.
export const editSentence = async (
  trx: Db,
  viewer: Author,
  input: { story: string; index: number; content: string; branch: boolean },
) => {
  const content = normaliseContent(input.content)
  const resolved = await requireStory(trx, input.story)
  const ids = resolved.sentenceIds
  const target = ids[input.index]
  if (target === undefined || target === ROOT_ID) {
    throw new ActionError('invalid')
  }
  const sentence = await trx
    .selectFrom('sentences')
    .select(['author_id', 'deleted_at'])
    .where('id', '=', target)
    .forUpdate()
    .executeTakeFirst()
  if (!sentence || sentence.deleted_at) {
    throw new ActionError('notFound')
  }

  if (!input.branch) {
    if (sentence.author_id !== viewer.id) {
      throw new ActionError('forbidden')
    }
    const editable = await editableSentences(trx, [target])
    if (!editable.has(target)) {
      throw new ActionError('forbidden')
    }
    await trx
      .updateTable('sentences')
      .set({ content })
      .where('id', '=', target)
      .execute()
    return { thread: resolved.thread }
  }

  const prefix = ids.slice(0, input.index)
  const id = await insertSentence(trx, viewer.id, content, prefix)
  await sql`
    insert into app.links (from_sentence_id, to_sentence_id, author_id)
    select ${id}, to_sentence_id, ${viewer.id}
    from app.links where from_sentence_id = ${target}
    on conflict do nothing
  `.execute(trx)
  const [thread] = await encodeThreads(trx, [
    [...prefix, id, ...ids.slice(input.index + 1)],
  ])
  return { thread: thread as string }
}

// Deletes the last sentence of a story. Sentences with children are only
// masked, and their parents are linked to their children so readers can
// skip past them.
export const deleteSentence = async (
  trx: Db,
  viewer: Author,
  story: string,
) => {
  const resolved = await requireStory(trx, story)
  const ids = resolved.sentenceIds
  const target = ids.at(-1) as number
  const sentence = await trx
    .selectFrom('sentences')
    .select(['author_id', 'deleted_at'])
    .where('id', '=', target)
    .forUpdate()
    .executeTakeFirst()
  if (!sentence || sentence.deleted_at) {
    throw new ActionError('notFound')
  }
  if (sentence.author_id !== viewer.id) {
    throw new ActionError('forbidden')
  }
  const child = await trx
    .selectFrom('links')
    .select('id')
    .where('from_sentence_id', '=', target)
    .where('to_sentence_id', '<>', target)
    .executeTakeFirst()
  if (child) {
    await trx
      .updateTable('sentences')
      .set({ deleted_at: new Date() })
      .where('id', '=', target)
      .execute()
    await sql`
      insert into app.links (from_sentence_id, to_sentence_id, author_id)
      select parent.from_sentence_id, child.to_sentence_id, null
      from app.links parent, app.links child
      where parent.to_sentence_id = ${target}
        and child.from_sentence_id = ${target}
        and parent.from_sentence_id <> ${target}
        and child.to_sentence_id <> ${target}
      on conflict do nothing
    `.execute(trx)
  } else {
    await trx.deleteFrom('sentences').where('id', '=', target).execute()
  }
  const [parentThread] = await encodeThreads(trx, [ids.slice(0, -1)])
  return { parentThread: parentThread as string, deleted: !child }
}

export type FragmentItem = { id: number; content: string; permalink: string }

// Sentences the viewer wrote, oldest first, linked to where they were written
export const myFragments = async (
  db: Db,
  viewer: Author,
  params: Extract<PageParams, { order: 'newest' | 'oldest' }>,
  search?: string,
): Promise<Page<FragmentItem>> => {
  const { cursor, op, direction } = keysetQuery(params)
  let query = db
    .selectFrom('sentences as s')
    .innerJoin('paths as origin', (join) =>
      join
        .onRef('origin.sentence_id', '=', 's.id')
        .on(
          sql<boolean>`origin.parent_id is not distinct from s.written_under_path_id`,
        ),
    )
    .select(['s.id', 's.content', 'origin.id as origin_path_id'])
    .where('s.author_id', '=', viewer.id)
    .where('s.deleted_at', 'is', null)
  if (search) {
    query = query.where('s.content', 'ilike', searchPattern(search))
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
      permalink: permalinks.get(r.origin_path_id)?.permalink ?? '/',
    })),
  }
}
