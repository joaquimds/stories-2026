import { sql } from 'kysely'
import { ROOT_ID, permalink } from '../../domain/thread.ts'
import { present } from '../../domain/present.ts'
import type { Db } from '../db/index.ts'
import { type ResolvedStory, encodeThreads, pathPermalinks } from './paths.ts'
import { popularOrder, popularityScores } from './rules.ts'
import { maskContent } from './sentences.ts'

// How much of the graph around a story to load at once
export const MAP_LIMITS = {
  // Sentences of the story itself, ending at the current one
  trunk: 5,
  // Levels loaded beyond the current sentence
  ahead: 3,
  // Levels loaded along a branch that leaves the story
  aside: 2,
  // Continuations loaded per sentence, the most popular first
  children: 8,
  // Sentences loaded that lead into the current one
  parents: 8,
  fragments: 150,
}

// One sentence on the map, however many routes lead to it
export type MapFragment = {
  id: number
  // Empty for the root
  content: string
  // All its continuations, loaded or not
  continuations: number
  // The story along the route it was written on
  origin: string
}

// A link from one sentence to another; a loop is a link back to a
// sentence already on the map
export type MapLink = { from: number; to: number }

export type MapGraph = { fragments: MapFragment[]; links: MapLink[] }

// Sentence details for the map
const describe = async (db: Db, ids: number[]): Promise<MapFragment[]> => {
  if (!ids.length) {
    return []
  }
  const rows = await db
    .selectFrom('sentences as s')
    .innerJoin('paths as origin', (join) =>
      join
        .onRef('origin.sentence_id', '=', 's.id')
        .on(
          sql<boolean>`origin.parent_id is not distinct from s.written_under_path_id`,
        ),
    )
    .select((eb) => [
      's.id',
      's.content',
      's.deleted_at',
      'origin.id as origin_path_id',
      eb
        .selectFrom('links as l')
        .innerJoin('sentences as t', 't.id', 'l.to_sentence_id')
        .whereRef('l.from_sentence_id', '=', 's.id')
        .where('t.deleted_at', 'is', null)
        .select(sql<number>`count(*)::int`.as('n'))
        .as('continuations'),
    ])
    .where('s.id', 'in', ids)
    .execute()
  const origins = await pathPermalinks(
    db,
    rows.map((r) => r.origin_path_id),
  )
  const byId = new Map(rows.map((r) => [r.id, r]))
  return ids.flatMap((id) => {
    const r = byId.get(id)
    if (!r) {
      return []
    }
    return [
      {
        id,
        content: id === ROOT_ID ? '' : maskContent(r.content, r.deleted_at),
        continuations: r.continuations ?? 0,
        origin: origins.get(r.origin_path_id)?.permalink ?? '/',
      },
    ]
  })
}

// Collects sentences and links in the order they are found
const collector = () => {
  const ids: number[] = []
  const seen = new Set<number>()
  const links: MapLink[] = []
  const linked = new Set<string>()
  return {
    ids,
    links,
    has: (id: number) => seen.has(id),
    add: (id: number) => {
      if (!seen.has(id)) {
        seen.add(id)
        ids.push(id)
      }
    },
    link: (from: number, to: number) => {
      const key = `${from}-${to}`
      if (!linked.has(key)) {
        linked.add(key)
        links.push({ from, to })
      }
    },
  }
}

type Frontier = {
  id: number
  // The path this route reaches the sentence by, if anyone has used it,
  // for ranking its continuations as the story page does
  pathId: number | null
  // The next sentence along the story, kept first so it is never cut off
  next?: number
  levels: number
}

// The graph around a story: its last few sentences, the branches leaving
// them, what lies a few steps ahead, and everything that leads into the
// current sentence. Each sentence appears once; a route that comes back to
// one already found shows as a link to it.
export const getStoryMap = async (
  db: Db,
  story: ResolvedStory,
  limits = MAP_LIMITS,
): Promise<MapGraph> => {
  const all = story.sentenceIds
  const start = Math.max(0, all.length - limits.trunk)
  const found = collector()
  for (let i = start; i < all.length; i++) {
    found.add(present(all[i]))
    if (i > start) {
      found.link(present(all[i - 1]), present(all[i]))
    }
  }

  // Branches leave each of the story's sentences, and the last one is
  // followed further ahead
  let frontier: Frontier[] = all.slice(start).map((id, offset) => {
    const i = start + offset
    const last = i === all.length - 1
    return {
      id,
      pathId: story.pathIds[i] ?? null,
      next: last ? undefined : all[i + 1],
      levels: last ? limits.ahead : limits.aside,
    }
  })
  const explored = new Set<number>()

  while (frontier.length && found.ids.length < limits.fragments) {
    const { rows } = await sql<{
      grp: number
      sentence_id: number
      path_id: number | null
    }>`
      with recursive ${popularityScores(sql`
        select f.grp, f.parent_path, l.to_sentence_id as sentence_id
        from unnest(
          ${frontier.map((_, i) => i)}::int[],
          ${frontier.map((f) => f.id)}::bigint[],
          ${frontier.map((f) => f.pathId)}::bigint[]
        ) as f(grp, sentence, parent_path)
        join app.links l on l.from_sentence_id = f.sentence
        join app.sentences s on s.id = l.to_sentence_id
        where s.deleted_at is null
      `)}
      select cand.grp, cand.sentence_id, step.id as path_id
      from cand
      left join scores using (grp, sentence_id)
      left join app.paths step
        on step.parent_id = cand.parent_path
        and step.sentence_id = cand.sentence_id
      order by cand.grp, ${popularOrder}
    `.execute(db)
    const continuations = frontier.map(
      (): { id: number; pathId: number | null }[] => [],
    )
    for (const row of rows) {
      continuations[row.grp]?.push({ id: row.sentence_id, pathId: row.path_id })
    }

    const next: Frontier[] = []
    for (const [index, item] of frontier.entries()) {
      explored.add(item.id)
      const children = continuations[index] ?? []
      const ordered =
        item.next === undefined
          ? children
          : [
              ...children.filter((c) => c.id === item.next),
              ...children.filter((c) => c.id !== item.next),
            ]
      for (const child of ordered.slice(0, limits.children)) {
        if (!found.has(child.id) && found.ids.length >= limits.fragments) {
          break
        }
        found.link(item.id, child.id)
        if (found.has(child.id)) {
          continue
        }
        found.add(child.id)
        if (item.levels > 1 && !explored.has(child.id)) {
          next.push({
            id: child.id,
            pathId: child.pathId,
            levels: item.levels - 1,
          })
        }
      }
    }
    frontier = next
  }

  // What leads into the current sentence: the story's previous sentence
  // first, so it is never cut off, then the rest by when they were linked
  const current = present(all.at(-1))
  const previous = all.at(-2)
  const leadingIn = await db
    .selectFrom('links as l')
    .innerJoin('sentences as s', 's.id', 'l.from_sentence_id')
    .select('l.from_sentence_id as id')
    .where('l.to_sentence_id', '=', current)
    .where('s.deleted_at', 'is', null)
    .orderBy('l.id')
    .execute()
  const parents = [
    ...leadingIn.filter((p) => p.id === previous),
    ...leadingIn.filter((p) => p.id !== previous),
  ]
  for (const { id } of parents.slice(0, limits.parents)) {
    if (!found.has(id) && found.ids.length >= limits.fragments) {
      break
    }
    found.link(id, current)
    found.add(id)
  }

  return {
    fragments: await describe(db, found.ids),
    links: found.links,
  }
}

// The story followed on to each continuation of its last sentence
export const extensionPermalinks = async (
  db: Db,
  story: ResolvedStory,
  graph: MapGraph,
): Promise<Record<number, string>> => {
  const last = story.sentenceIds.at(-1)
  const next = graph.links.filter((l) => l.from === last).map((l) => l.to)
  const threads = await encodeThreads(
    db,
    next.map((id) => [...story.sentenceIds, id]),
  )
  return Object.fromEntries(
    next.map((id, i) => [id, permalink(present(threads[i]))]),
  )
}
