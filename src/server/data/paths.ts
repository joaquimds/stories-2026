import { sql } from 'kysely'
import {
  type ThreadGraph,
  decodeThread,
  encodeThread,
  isThread,
  parseThread,
} from '../../domain/thread.ts'
import type { Db } from '../db/index.ts'

export type DefaultParents = Map<number, number | null>

export const permalink = (thread: string, slug?: string | null) =>
  `/s/${slug ?? thread}`

export const loadDefaultParents = async (
  db: Db,
  sentenceIds: number[],
): Promise<DefaultParents> => {
  const ids = [...new Set(sentenceIds)]
  if (!ids.length) {
    return new Map()
  }
  const rows = await db
    .selectFrom('sentences as s')
    .leftJoin('paths as p', 'p.id', 's.written_under_path_id')
    .select(['s.id', 'p.sentence_id as default_parent'])
    .where('s.id', 'in', ids)
    .execute()
  return new Map(rows.map((r) => [r.id, r.default_parent]))
}

export const threadOf = (sentenceIds: number[], defaults: DefaultParents) =>
  encodeThread(sentenceIds, (id) => defaults.get(id))

// Encodes several sentence sequences with a single query
export const encodeThreads = async (db: Db, sequences: number[][]) => {
  const defaults = await loadDefaultParents(db, sequences.flat())
  return sequences.map((ids) => threadOf(ids, defaults))
}

export type ResolvedStory = {
  sentenceIds: number[]
  // Path id of each prefix of sentenceIds, or null where no row exists yet
  pathIds: (number | null)[]
  defaults: DefaultParents
  thread: string
}

// Walks a thread back to its beginning in one query, then validates it.
const decodeFromDb = async (db: Db, thread: string) => {
  const parsed = parseThread(thread)
  if (!parsed) {
    return null
  }
  const froms = parsed.steps.map((s) => s.from)
  const tos = parsed.steps.map((s) => s.to)
  const { rows } = await sql<{ id: number; default_parent: number | null }>`
    with recursive
      steps as (
        select * from unnest(${froms}::bigint[], ${tos}::bigint[])
          with ordinality as t(step_from, step_to, i)
      ),
      walk(depth, sentence_id, step_index) as (
        select 0, ${parsed.leaf}::bigint, 1::bigint
        union all
        select
          w.depth + 1,
          case when st.step_from = w.sentence_id then st.step_to else dp.sentence_id end,
          case when st.step_from = w.sentence_id then w.step_index + 1 else w.step_index end
        from walk w
        join app.sentences s on s.id = w.sentence_id
        left join app.paths dp on dp.id = s.written_under_path_id
        left join steps st on st.i = w.step_index
        where (st.step_from = w.sentence_id or dp.sentence_id is not null)
          and w.depth < 10000
      )
    select distinct s.id, dp.sentence_id as default_parent
    from walk w
    join app.sentences s on s.id = w.sentence_id
    left join app.paths dp on dp.id = s.written_under_path_id
  `.execute(db)
  const defaults: DefaultParents = new Map(
    rows.map((r) => [r.id, r.default_parent]),
  )
  const stepLinks = new Set<string>()
  if (parsed.steps.length) {
    const links = await db
      .selectFrom('links')
      .select(['from_sentence_id', 'to_sentence_id'])
      .where((eb) =>
        eb.or(
          parsed.steps.map((step) =>
            eb.and([
              eb('from_sentence_id', '=', step.to),
              eb('to_sentence_id', '=', step.from),
            ]),
          ),
        ),
      )
      .execute()
    for (const link of links) {
      stepLinks.add(`${link.from_sentence_id}-${link.to_sentence_id}`)
    }
  }
  const graph: ThreadGraph = {
    defaultParent: (id) => defaults.get(id),
    hasLink: (from, to) => stepLinks.has(`${from}-${to}`),
  }
  const sentenceIds = decodeThread(parsed, graph)
  return sentenceIds ? { sentenceIds, defaults } : null
}

// Path ids for every prefix of a sentence sequence that has a row
export const resolvePrefixes = async (
  db: Db,
  sentenceIds: number[],
): Promise<(number | null)[]> => {
  if (!sentenceIds.length) {
    return []
  }
  const { rows } = await sql<{ i: number; id: number }>`
    with recursive m(i, id) as (
      select 1, p.id from app.paths p
      where p.parent_id is null and p.sentence_id = (${sentenceIds}::bigint[])[1]
      union all
      select m.i + 1, p.id from m
      join app.paths p
        on p.parent_id = m.id
        and p.sentence_id = (${sentenceIds}::bigint[])[m.i + 1]
      where m.i < ${sentenceIds.length}
    )
    select i, id from m
  `.execute(db)
  const pathIds: (number | null)[] = sentenceIds.map(() => null)
  for (const row of rows) {
    pathIds[row.i - 1] = row.id
  }
  return pathIds
}

export const resolvePath = async (db: Db, sentenceIds: number[]) => {
  const pathIds = await resolvePrefixes(db, sentenceIds)
  return { sentenceIds, pathId: pathIds.at(-1) ?? null }
}

// Creates the path and any missing ancestors. Call inside a transaction.
export const ensurePath = async (
  trx: Db,
  sentenceIds: number[],
): Promise<number> => {
  const pathIds = await resolvePrefixes(trx, sentenceIds)
  let parentId: number | null = null
  for (let i = 0; i < sentenceIds.length; i++) {
    const existing = pathIds[i]
    if (existing) {
      parentId = existing
      continue
    }
    const row: { id: number } = await trx
      .insertInto('paths')
      .values({ parent_id: parentId, sentence_id: sentenceIds[i] as number })
      .onConflict((oc) =>
        oc
          .columns(['parent_id', 'sentence_id'])
          .doUpdateSet((eb) => ({
            sentence_id: eb.ref('excluded.sentence_id'),
          })),
      )
      .returning('id')
      .executeTakeFirstOrThrow()
    parentId = row.id
  }
  if (parentId === null) {
    throw new Error('Cannot ensure an empty path')
  }
  return parentId
}

// Sentence ids (root to leaf) of each path
export const pathSentenceIds = async (
  db: Db,
  pathIds: number[],
): Promise<Map<number, number[]>> => {
  const result = new Map<number, number[]>()
  if (!pathIds.length) {
    return result
  }
  const { rows } = await sql<{ origin: number; sentence_id: number }>`
    with recursive up(origin, id, parent_id, sentence_id, depth) as (
      select p.id, p.id, p.parent_id, p.sentence_id, 0
      from app.paths p where p.id = any(${pathIds}::bigint[])
      union all
      select up.origin, p.id, p.parent_id, p.sentence_id, up.depth + 1
      from up join app.paths p on p.id = up.parent_id
    )
    select origin, sentence_id from up order by origin, depth desc
  `.execute(db)
  for (const row of rows) {
    const ids = result.get(row.origin) ?? []
    ids.push(row.sentence_id)
    result.set(row.origin, ids)
  }
  return result
}

// Threads of several paths, with slugs where they are titled
export const pathPermalinks = async (db: Db, pathIds: number[]) => {
  const idsByPath = await pathSentenceIds(db, pathIds)
  const defaults = await loadDefaultParents(db, [...idsByPath.values()].flat())
  const titles = pathIds.length
    ? await db
        .selectFrom('titles')
        .select(['path_id', 'slug'])
        .where('path_id', 'in', pathIds)
        .execute()
    : []
  const slugs = new Map(titles.map((t) => [t.path_id, t.slug]))
  const result = new Map<
    number,
    { sentenceIds: number[]; thread: string; permalink: string }
  >()
  for (const [pathId, sentenceIds] of idsByPath) {
    const thread = threadOf(sentenceIds, defaults)
    result.set(pathId, {
      sentenceIds,
      thread,
      permalink: permalink(thread, slugs.get(pathId)),
    })
  }
  return result
}

// Resolves a story URL segment: a thread, or the slug of a titled story
export const resolveStory = async (
  db: Db,
  story: string,
): Promise<ResolvedStory | null> => {
  let decoded: { sentenceIds: number[]; defaults: DefaultParents } | null
  if (isThread(story)) {
    decoded = await decodeFromDb(db, story)
  } else {
    const title = await db
      .selectFrom('titles')
      .select('path_id')
      .where('slug', '=', story)
      .executeTakeFirst()
    if (!title) {
      return null
    }
    const sentenceIds = (await pathSentenceIds(db, [title.path_id])).get(
      title.path_id,
    )
    decoded = sentenceIds
      ? { sentenceIds, defaults: await loadDefaultParents(db, sentenceIds) }
      : null
  }
  if (!decoded) {
    return null
  }
  return {
    ...decoded,
    pathIds: await resolvePrefixes(db, decoded.sentenceIds),
    thread: threadOf(decoded.sentenceIds, decoded.defaults),
  }
}
