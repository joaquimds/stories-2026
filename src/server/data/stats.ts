import { sql } from 'kysely'
import type { Db } from '../db/index.ts'
import { pathPermalinks } from './paths.ts'
import { DELETED } from './sentences.ts'
import { last, present } from '../../domain/present.ts'

export type Stats = {
  sentences: number
  writers: number
  likes: number
  titledStories: number
  sentencesLastWeek: number
  sentencesLastMonth: number
  longestStory: { length: number; permalink: string } | null
  mostBranched: { content: string; children: number; permalink: string } | null
  mostLiked: { likes: number; title: string | null; permalink: string } | null
  loops: number
  computedAt: Date
}

const CACHE_MS = 5 * 60 * 1000
let cached: Stats | undefined

export const getStats = async (db: Db): Promise<Stats> => {
  if (cached && Date.now() - cached.computedAt.getTime() < CACHE_MS) {
    return cached
  }
  cached = await computeStats(db)
  return cached
}

export const computeStats = async (db: Db): Promise<Stats> => {
  const { rows: totals } = await sql<{
    sentences: number
    writers: number
    likes: number
    titled_stories: number
    last_week: number
    last_month: number
  }>`
    select
      (select count(*) from app.sentences where deleted_at is null and author_id is not null)::int as sentences,
      (select count(distinct author_id) from app.sentences where deleted_at is null)::int as writers,
      (select count(*) from app.likes)::int as likes,
      (select count(*) from app.titles)::int as titled_stories,
      (select count(*) from app.sentences
        where deleted_at is null and author_id is not null
          and created_at > now() - interval '7 days')::int as last_week,
      (select count(*) from app.sentences
        where deleted_at is null and author_id is not null
          and created_at > now() - interval '30 days')::int as last_month
  `.execute(db)

  const { rows: deepest } = await sql<{ id: number; depth: number }>`
    with recursive tree(id, depth) as (
      -- The root's path has depth 0, so depth counts sentences
      select id, 0 from app.paths where parent_id is null
      union all
      select p.id, tree.depth + 1 from tree join app.paths p on p.parent_id = tree.id
    )
    select id, depth from tree where depth > 0 order by depth desc, id limit 1
  `.execute(db)

  const { rows: branched } = await sql<{
    id: number
    content: string
    children: number
    origin_path_id: number
  }>`
    select s.id, s.content, count(*)::int as children, origin.id as origin_path_id
    from app.sentences s
    join app.links l on l.from_sentence_id = s.id
    join app.sentences c on c.id = l.to_sentence_id and c.deleted_at is null
    join app.paths origin
      on origin.sentence_id = s.id
      and origin.parent_id is not distinct from s.written_under_path_id
    where s.deleted_at is null and s.author_id is not null
    group by s.id, origin.id
    order by children desc, s.id
    limit 1
  `.execute(db)

  const { rows: liked } = await sql<{
    path_id: number
    likes: number
    title: string | null
  }>`
    select l.path_id, count(*)::int as likes, t.title
    from app.likes l left join app.titles t on t.path_id = l.path_id
    group by l.path_id, t.title
    order by likes desc, l.path_id
    limit 1
  `.execute(db)

  const links = await db
    .selectFrom('links as l')
    .innerJoin('sentences as f', 'f.id', 'l.from_sentence_id')
    .innerJoin('sentences as t', 't.id', 'l.to_sentence_id')
    .select(['l.from_sentence_id', 'l.to_sentence_id'])
    .where('f.deleted_at', 'is', null)
    .where('t.deleted_at', 'is', null)
    .execute()

  const pathIds = [
    deepest[0]?.id,
    branched[0]?.origin_path_id,
    liked[0]?.path_id,
  ]
  const permalinks = await pathPermalinks(
    db,
    pathIds.filter((id): id is number => id !== undefined),
  )
  const linkTo = (pathId: number) => permalinks.get(pathId)?.permalink ?? '/'

  const total = totals[0]
  return {
    sentences: total?.sentences ?? 0,
    writers: total?.writers ?? 0,
    likes: total?.likes ?? 0,
    titledStories: total?.titled_stories ?? 0,
    sentencesLastWeek: total?.last_week ?? 0,
    sentencesLastMonth: total?.last_month ?? 0,
    longestStory: deepest[0]
      ? { length: deepest[0].depth, permalink: linkTo(deepest[0].id) }
      : null,
    mostBranched: branched[0]
      ? {
          content: branched[0].content || DELETED,
          children: branched[0].children,
          permalink: linkTo(branched[0].origin_path_id),
        }
      : null,
    mostLiked: liked[0]
      ? {
          likes: liked[0].likes,
          title: liked[0].title,
          permalink: linkTo(liked[0].path_id),
        }
      : null,
    loops: countLoops(links.map((l) => [l.from_sentence_id, l.to_sentence_id])),
    computedAt: new Date(),
  }
}

// The number of independent loops in a directed graph: for each strongly
// connected component, its edges minus its nodes plus one.
export const countLoops = (edges: [number, number][]) => {
  const adjacency = new Map<number, number[]>()
  for (const [from, to] of edges) {
    adjacency.set(from, [...(adjacency.get(from) ?? []), to])
    if (!adjacency.has(to)) {
      adjacency.set(to, [])
    }
  }
  // Iterative Tarjan
  const index = new Map<number, number>()
  const low = new Map<number, number>()
  const component = new Map<number, number>()
  const stack: number[] = []
  const onStack = new Set<number>()
  let counter = 0
  let components = 0
  for (const root of adjacency.keys()) {
    if (index.has(root)) {
      continue
    }
    const work: [number, number][] = [[root, 0]]
    while (work.length) {
      const frame = last(work)
      const [node, next] = frame
      if (next === 0) {
        index.set(node, counter)
        low.set(node, counter)
        counter++
        stack.push(node)
        onStack.add(node)
      }
      const neighbours = adjacency.get(node) ?? []
      if (next < neighbours.length) {
        frame[1]++
        const neighbour = present(neighbours[next])
        if (!index.has(neighbour)) {
          work.push([neighbour, 0])
        } else if (onStack.has(neighbour)) {
          low.set(node, Math.min(low.get(node)!, index.get(neighbour)!))
        }
        continue
      }
      work.pop()
      const parent = work[work.length - 1]
      if (parent) {
        low.set(parent[0], Math.min(low.get(parent[0])!, low.get(node)!))
      }
      if (low.get(node) === index.get(node)) {
        let member: number | undefined
        do {
          member = present(stack.pop())
          onStack.delete(member)
          component.set(member, components)
        } while (member !== node)
        components++
      }
    }
  }
  const nodes = new Map<number, number>()
  const internalEdges = new Map<number, number>()
  for (const c of component.values()) {
    nodes.set(c, (nodes.get(c) ?? 0) + 1)
  }
  for (const [from, to] of edges) {
    const c = component.get(from)
    if (c !== undefined && c === component.get(to)) {
      internalEdges.set(c, (internalEdges.get(c) ?? 0) + 1)
    }
  }
  let loops = 0
  for (const [c, count] of internalEdges) {
    loops += count - (nodes.get(c) ?? 0) + 1
  }
  return loops
}
