import { sql } from 'kysely'
import { ROOT_ID, permalink } from '../../domain/thread.ts'
import type { Db } from '../db/index.ts'
import { type ResolvedStory, loadDefaultParents, threadOf } from './paths.ts'
import { sentencePopularity } from './rules.ts'

// How much of the tree around a story to show
export const MAP_LIMITS = {
  // Sentences of the story itself, ending at the current one
  trunk: 5,
  // Levels shown beyond the current sentence
  ahead: 3,
  // Levels shown along a branch that leaves the story
  aside: 2,
  // Continuations shown per sentence, the most popular first
  children: 8,
  nodes: 150,
}

export type MapNode = {
  key: string
  parent: string | null
  sentenceId: number
  content: string
  permalink: string
  depth: number
  // Part of the story being read, and where the reader is
  onStory: boolean
  current: boolean
  // The sentence appears earlier on its own path, so it loops back
  loop: boolean
  // Continuations not shown
  more: number
}

type Pending = {
  node: MapNode
  // Sentence ids from the map's first node to this one
  ids: number[]
  // Levels left to expand below this node
  budget: number
}

// The part of the story graph around a story, as a tree of paths: the end
// of the story, the branches along it, and what lies a few steps ahead
export const getStoryMap = async (
  db: Db,
  story: ResolvedStory,
  limits = MAP_LIMITS,
): Promise<MapNode[]> => {
  const all = story.sentenceIds
  // Show the root only when the story is short enough to include it
  const start = Math.max(0, all.length - limits.trunk)
  const prefix = all.slice(0, start)
  const trunk = all.slice(start)

  const content = async (ids: number[]) => {
    const rows = ids.length
      ? await db
          .selectFrom('sentences')
          .select(['id', 'content', 'deleted_at'])
          .where('id', 'in', ids)
          .execute()
      : []
    return new Map(
      rows.map((r) => [r.id, r.deleted_at ? '[deleted]' : r.content]),
    )
  }

  const first = trunk[0] as number
  const firstContent = await content([first])
  const nodes: MapNode[] = []
  const sequences = new Map<string, number[]>()
  const add = (node: Omit<MapNode, 'permalink'>, ids: number[]) => {
    const full = { ...node, permalink: '' }
    nodes.push(full)
    sequences.set(full.key, [...prefix, ...ids])
    return full
  }

  const rootNode = add(
    {
      key: '0',
      parent: null,
      sentenceId: first,
      content: first === ROOT_ID ? '' : (firstContent.get(first) ?? ''),
      depth: 0,
      onStory: true,
      current: trunk.length === 1,
      loop: false,
      more: 0,
    },
    [first],
  )
  let frontier: Pending[] = [
    {
      node: rootNode,
      ids: [first],
      budget: trunk.length === 1 ? limits.ahead : Number.POSITIVE_INFINITY,
    },
  ]

  while (frontier.length && nodes.length < limits.nodes) {
    const parents = [...new Set(frontier.map((p) => p.ids.at(-1) as number))]
    const { rows } = await sql<{ parent: number; id: number }>`
      select l.from_sentence_id as parent, c.id
      from app.links l
      join app.sentences c on c.id = l.to_sentence_id
      where l.from_sentence_id = any(${parents}::bigint[])
        and c.deleted_at is null
      order by c.id
    `.execute(db)
    const childrenOf = new Map<number, number[]>()
    for (const row of rows) {
      childrenOf.set(row.parent, [
        ...(childrenOf.get(row.parent) ?? []),
        row.id,
      ])
    }
    const [texts, popularity] = await Promise.all([
      content(rows.map((r) => r.id)),
      sentencePopularity(db, [...new Set(rows.map((r) => r.id))]),
    ])
    // Most popular first, then oldest, as on the story page
    for (const children of childrenOf.values()) {
      children.sort(
        (a, b) => (popularity.get(b) ?? 0) - (popularity.get(a) ?? 0) || a - b,
      )
    }

    const next: Pending[] = []
    for (const { node, ids, budget } of frontier) {
      const children = childrenOf.get(ids.at(-1) as number) ?? []
      if (budget <= 0 || node.loop) {
        node.more = children.length
        continue
      }
      // The story's next sentence comes first, so it is never cut off
      const trunkNext = node.onStory ? trunk[node.depth + 1] : undefined
      const ordered =
        trunkNext === undefined
          ? children
          : [trunkNext, ...children.filter((id) => id !== trunkNext)]
      const shown = ordered.slice(0, limits.children)
      node.more = children.length - shown.length
      for (const [i, id] of shown.entries()) {
        if (nodes.length >= limits.nodes) {
          node.more += shown.length - i
          break
        }
        const onStory = node.onStory && id === trunkNext
        const childIds = [...ids, id]
        const current = onStory && node.depth + 1 === trunk.length - 1
        const child = add(
          {
            key: `${node.key}.${i}`,
            parent: node.key,
            sentenceId: id,
            content: texts.get(id) ?? '',
            depth: node.depth + 1,
            onStory,
            current,
            loop: ids.includes(id),
            more: 0,
          },
          childIds,
        )
        next.push({
          node: child,
          ids: childIds,
          // The story itself is shown in full; the current sentence's
          // continuations `ahead` levels deep; branches leaving the story
          // `aside` levels deep
          budget: onStory
            ? current
              ? limits.ahead
              : Number.POSITIVE_INFINITY
            : node.onStory && !node.current
              ? limits.aside - 1
              : budget - 1,
        })
      }
    }
    frontier = next
  }

  const defaults = await loadDefaultParents(db, [...sequences.values()].flat())
  for (const node of nodes) {
    node.permalink = permalink(
      threadOf(sequences.get(node.key) as number[], defaults),
    )
  }
  return nodes
}
