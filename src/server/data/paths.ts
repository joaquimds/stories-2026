import { type RawBuilder, sql } from 'kysely'
import {
  type ThreadGraph,
  decodeThread,
  encodeThread,
  isThread,
  parseThread,
  permalink,
} from '../../domain/thread.ts'
import type { Db } from '../db/index.ts'
import { present } from '../../domain/present.ts'

export { permalink }

export type DefaultParents = Map<number, number | null>

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

export const encodeOneThread = async (db: Db, sentenceIds: number[]) =>
  present((await encodeThreads(db, [sentenceIds]))[0])

export type ResolvedStory = {
  sentenceIds: number[]
  // Path id of each prefix of sentenceIds, or null where no row exists yet
  pathIds: (number | null)[]
  defaults: DefaultParents
  thread: string
}

type Decoded = {
  sentenceIds: number[]
  defaults: DefaultParents
  pathIds: (number | null)[]
}

// Walks a thread back to its beginning, then validates it. One query finds
// the walk, which of the thread's steps are real links, and the path id of
// every point along the walk.
const decodeFromDb = async (
  db: Db,
  thread: string,
): Promise<Decoded | null> => {
  const parsed = parseThread(thread)
  if (!parsed) {
    return null
  }
  const froms = parsed.steps.map((s) => s.from)
  const tos = parsed.steps.map((s) => s.to)
  const { rows } = await sql<{
    kind: 'walk' | 'link' | 'path'
    a: number
    b: number | null
  }>`
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
      ),
      seq as (
        select array_agg(sentence_id order by depth desc) as ids from walk
      ),
      m(i, id) as (
        select 1, p.id from seq, app.paths p
        where p.parent_id is null and p.sentence_id = seq.ids[1]
        union all
        select m.i + 1, p.id from m
        cross join seq
        join app.paths p
          on p.parent_id = m.id and p.sentence_id = seq.ids[m.i + 1]
        where m.i < cardinality(seq.ids)
      )
    select 'walk' as kind, s.id as a, dp.sentence_id as b
    from (select distinct sentence_id from walk) w
    join app.sentences s on s.id = w.sentence_id
    left join app.paths dp on dp.id = s.written_under_path_id
    union all
    select 'link', l.from_sentence_id, l.to_sentence_id
    from steps st
    join app.links l
      on l.from_sentence_id = st.step_to and l.to_sentence_id = st.step_from
    union all
    select 'path', m.i, m.id from m
  `.execute(db)
  const defaults: DefaultParents = new Map()
  const stepLinks = new Set<string>()
  const walkedPaths = new Map<number, number>()
  for (const row of rows) {
    if (row.kind === 'walk') {
      defaults.set(row.a, row.b)
    } else if (row.kind === 'link') {
      stepLinks.add(`${row.a}-${row.b}`)
    } else if (row.b !== null) {
      walkedPaths.set(row.a, row.b)
    }
  }
  const graph: ThreadGraph = {
    defaultParent: (id) => defaults.get(id),
    hasLink: (from, to) => stepLinks.has(`${from}-${to}`),
  }
  const sentenceIds = decodeThread(parsed, graph)
  if (!sentenceIds) {
    return null
  }
  // The path ids found follow the walk, which is the decoded story when
  // the thread is valid
  const pathIds = sentenceIds.map((_, i) => walkedPaths.get(i + 1) ?? null)
  return { sentenceIds, defaults, pathIds }
}

// A titled story, all in one query: a title belongs to a path, and every
// point on the way to it is a path too
const decodeTitled = async (db: Db, slug: string): Promise<Decoded | null> => {
  const { rows } = await sql<{
    path_id: number
    sentence_id: number
    default_parent: number | null
  }>`
    with recursive up(id, parent_id, sentence_id, depth) as (
      select p.id, p.parent_id, p.sentence_id, 0
      from app.titles t join app.paths p on p.id = t.path_id
      where t.slug = ${slug}
      union all
      select p.id, p.parent_id, p.sentence_id, up.depth + 1
      from up join app.paths p on p.id = up.parent_id
    )
    select up.id as path_id, up.sentence_id, dp.sentence_id as default_parent
    from up
    join app.sentences s on s.id = up.sentence_id
    left join app.paths dp on dp.id = s.written_under_path_id
    order by up.depth desc
  `.execute(db)
  if (!rows.length) {
    return null
  }
  return {
    sentenceIds: rows.map((r) => r.sentence_id),
    defaults: new Map(rows.map((r) => [r.sentence_id, r.default_parent])),
    pathIds: rows.map((r) => r.path_id),
  }
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
      .values({ parent_id: parentId, sentence_id: present(sentenceIds[i]) })
      .onConflict((oc) =>
        oc.columns(['parent_id', 'sentence_id']).doUpdateSet((eb) => ({
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

type Permalinks = Map<
  number,
  { sentenceIds: number[]; thread: string; permalink: string }
>

// Threads of the paths `seed` selects, with slugs where they are titled, in
// one query: each path's sentences, what each was written after, and its
// title. Keyed by path id.
const permalinksFrom = async (
  db: Db,
  seed: RawBuilder<{ id: number }>,
): Promise<Permalinks> => {
  const { rows } = await sql<{
    origin: number
    sentence_id: number
    default_parent: number | null
    slug: string | null
  }>`
    with recursive up(origin, id, parent_id, sentence_id, depth) as (
      select p.id, p.id, p.parent_id, p.sentence_id, 0
      from app.paths p where p.id in (${seed})
      union all
      select up.origin, p.id, p.parent_id, p.sentence_id, up.depth + 1
      from up join app.paths p on p.id = up.parent_id
    )
    select up.origin, up.sentence_id, dp.sentence_id as default_parent,
      t.slug
    from up
    join app.sentences s on s.id = up.sentence_id
    left join app.paths dp on dp.id = s.written_under_path_id
    left join app.titles t on t.path_id = up.origin and up.depth = 0
    order by up.origin, up.depth desc
  `.execute(db)
  const defaults: DefaultParents = new Map()
  const idsByPath = new Map<number, number[]>()
  const slugs = new Map<number, string>()
  for (const row of rows) {
    defaults.set(row.sentence_id, row.default_parent)
    idsByPath.set(row.origin, [
      ...(idsByPath.get(row.origin) ?? []),
      row.sentence_id,
    ])
    if (row.slug) {
      slugs.set(row.origin, row.slug)
    }
  }
  const result: Permalinks = new Map()
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

// Threads of several paths, with slugs where they are titled
export const pathPermalinks = (db: Db, pathIds: number[]) =>
  pathIds.length
    ? permalinksFrom(db, sql`select unnest(${pathIds}::bigint[]) as id`)
    : Promise.resolve<Permalinks>(new Map())

// The address of the story each sentence was written in: its origin path,
// the same query as pathPermalinks. Keyed by sentence id.
export const originPermalinks = async (db: Db, sentenceIds: number[]) => {
  const byPath = sentenceIds.length
    ? await permalinksFrom(
        db,
        sql`
          select p.id from app.sentences s
          join app.paths p
            on p.sentence_id = s.id
            and p.parent_id is not distinct from s.written_under_path_id
          where s.id = any(${sentenceIds}::bigint[])
        `,
      )
    : new Map()
  return new Map(
    [...byPath.values()].map((p) => [
      present(p.sentenceIds.at(-1)),
      p.permalink,
    ]),
  )
}

// Resolves a story URL segment: a thread, or the slug of a titled story.
// One query either way.
export const resolveStory = async (
  db: Db,
  story: string,
): Promise<ResolvedStory | null> => {
  const decoded = isThread(story)
    ? await decodeFromDb(db, story)
    : await decodeTitled(db, story)
  if (!decoded) {
    return null
  }
  return {
    ...decoded,
    thread: threadOf(decoded.sentenceIds, decoded.defaults),
  }
}
