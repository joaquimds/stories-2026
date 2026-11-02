import { sql } from 'kysely'
import { ROOT_ID } from '../../domain/thread.ts'
import { present } from '../../domain/present.ts'
import type { Db } from '../db/index.ts'
import {
  type ResolvedStory,
  loadDefaultParents,
  pathPermalinks,
} from './paths.ts'
import { popularOrder, popularityScores } from './rules.ts'
import { maskContent } from './sentences.ts'

// How much of the graph around a story to load at once: a step either
// way from the current sentence, so moving around feels like walking
export const MAP_LIMITS = {
  // Sentences of the story itself, ending at the current one
  trunk: 5,
  // Continuations loaded of the current sentence, the most popular first
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
  // The sentence it was written after, for writing threads; null for a
  // beginning (and the root)
  defaultParent: number | null
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
  const [origins, defaults] = await Promise.all([
    pathPermalinks(
      db,
      rows.map((r) => r.origin_path_id),
    ),
    loadDefaultParents(db, ids),
  ])
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
        defaultParent: defaults.get(id) ?? null,
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

// The graph around a story: its last few sentences, then one step either
// way from the current one, everything it leads to and everything leading
// into it. Each sentence appears once; a route that comes back to one
// already found shows as a link to it.
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

  // One step on from the current sentence, ranked as on the story page
  const current = present(all.at(-1))
  const { rows } = await sql<{ sentence_id: number }>`
    with recursive ${popularityScores(sql`
      select 0 as grp, ${story.pathIds.at(-1) ?? null}::bigint as parent_path,
        l.to_sentence_id as sentence_id
      from app.links l
      join app.sentences s on s.id = l.to_sentence_id
      where l.from_sentence_id = ${current} and s.deleted_at is null
    `)}
    select cand.sentence_id
    from cand
    left join scores using (grp, sentence_id)
    order by ${popularOrder}
  `.execute(db)
  for (const { sentence_id: id } of rows.slice(0, limits.children)) {
    if (!found.has(id) && found.ids.length >= limits.fragments) {
      break
    }
    found.link(current, id)
    found.add(id)
  }

  // One step back: what leads into the current sentence, the story's
  // previous sentence first so it is never cut off, then the rest by when
  // they were linked
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
