import { sql } from 'kysely'
import { ROOT_ID, permalink } from '../../domain/thread.ts'
import type { Db } from '../db/index.ts'
import { type ResolvedStory, loadDefaultParents, threadOf } from './paths.ts'
import { popularOrder, popularityScores } from './rules.ts'

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
  // The path for this route, if anyone has used it
  pathId: number | null
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
      pathId: story.pathIds[start] ?? null,
      budget: trunk.length === 1 ? limits.ahead : Number.POSITIVE_INFINITY,
    },
  ]

  while (frontier.length && nodes.length < limits.nodes) {
    // Each frontier route's continuations, in the Popular order, with the
    // path each continuation would make if anyone has used it
    const { rows } = await sql<{
      grp: number
      sentence_id: number
      path_id: number | null
    }>`
      with recursive ${popularityScores(sql`
        select f.grp, f.parent_path, l.to_sentence_id as sentence_id
        from unnest(
          ${frontier.map((_, i) => i)}::int[],
          ${frontier.map((p) => p.ids.at(-1) as number)}::bigint[],
          ${frontier.map((p) => p.pathId)}::bigint[]
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
      () => [] as { id: number; pathId: number | null }[],
    )
    for (const row of rows) {
      continuations[row.grp]?.push({ id: row.sentence_id, pathId: row.path_id })
    }
    const texts = await content(rows.map((r) => r.sentence_id))

    const next: Pending[] = []
    for (const [index, { node, ids, budget }] of frontier.entries()) {
      const children = continuations[index] ?? []
      if (budget <= 0 || node.loop) {
        node.more = children.length
        continue
      }
      // The story's next sentence comes first, so it is never cut off
      const trunkNext = node.onStory ? trunk[node.depth + 1] : undefined
      const ordered =
        trunkNext === undefined
          ? children
          : [
              ...children.filter((c) => c.id === trunkNext),
              ...children.filter((c) => c.id !== trunkNext),
            ]
      const shown = ordered.slice(0, limits.children)
      node.more = children.length - shown.length
      for (const [i, { id, pathId }] of shown.entries()) {
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
          pathId,
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
