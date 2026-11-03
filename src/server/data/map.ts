import { sql } from 'kysely'
import { ROOT_ID } from '../../domain/thread.ts'
import { present } from '../../domain/present.ts'
import type { Db } from '../db/index.ts'
import {
  type ResolvedStory,
  loadDefaultParents,
  pathPermalinks,
} from './paths.ts'
import { loadSentences } from './sentences.ts'
import { getChildren } from './stories.ts'

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

export type MapGraph = {
  fragments: MapFragment[]
  links: MapLink[]
  // Where each continuation of the current sentence leads, exactly as on
  // the story page
  steps: Record<number, string>
}

// Sentence details for the map: content as the story page shows it, how
// many continuations each has, its own story and what it was written after
const describe = async (db: Db, ids: number[]): Promise<MapFragment[]> => {
  if (!ids.length) {
    return []
  }
  const [sentences, rows, defaults] = await Promise.all([
    loadSentences(db, ids),
    db
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
      .execute(),
    loadDefaultParents(db, ids),
  ])
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
        content: id === ROOT_ID ? '' : (sentences.get(id)?.content ?? ''),
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

// The graph around a story: the whole story, from the beginning, and one
// step on from where you are, the story page's own continuations. So
// everything on the map can be reached by walking on from somewhere on the
// story. Each sentence appears once; a route that comes back to one already
// found shows as a link to it.
export const getStoryMap = async (
  db: Db,
  story: ResolvedStory,
): Promise<MapGraph> => {
  const all = story.sentenceIds
  const found = collector()
  for (const [i, id] of all.entries()) {
    found.add(id)
    if (i > 0) {
      found.link(present(all[i - 1]), id)
    }
  }

  // One step on: the story page's continuations, ranked and addressed by
  // the same function
  const current = present(all.at(-1))
  const { page } = await getChildren(db, story, { order: 'popular' })
  for (const child of page.items) {
    found.link(current, child.sentenceId)
    found.add(child.sentenceId)
  }

  return {
    fragments: await describe(db, found.ids),
    links: found.links,
    steps: Object.fromEntries(
      page.items.map((child) => [child.sentenceId, child.permalink]),
    ),
  }
}
