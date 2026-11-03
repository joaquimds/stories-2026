import type { MapFragment, MapGraph } from '../server/data/map.ts'

// The map's graph in the browser: everything loaded so far, merged as you
// move around and pruned after a delete or unlink

// Everything loaded so far, one entry per sentence
export type Graph = {
  fragments: Map<number, MapFragment>
  links: Map<string, { from: number; to: number }>
}

export const linkKey = (from: number, to: number) => `${from}-${to}`

// Adds newly loaded sentences and links; the same graph back if nothing
// is new, so the layout only restarts when there is something to place
export const merge = (graph: Graph, more: MapGraph): Graph => {
  const fresh =
    more.fragments.some((f) => !graph.fragments.has(f.id)) ||
    more.links.some((l) => !graph.links.has(linkKey(l.from, l.to)))
  if (!fresh) {
    return graph
  }
  const fragments = new Map(graph.fragments)
  for (const fragment of more.fragments) {
    fragments.set(fragment.id, fragment)
  }
  const links = new Map(graph.links)
  for (const link of more.links) {
    links.set(linkKey(link.from, link.to), link)
  }
  return { fragments, links }
}

export const EMPTY: Graph = { fragments: new Map(), links: new Map() }

// Takes out what a delete or unlink removed, then anything no longer
// reachable from the beginning, so everything on the map can still be
// walked to
export const removeFromGraph = (
  graph: Graph,
  gone: { fragments?: number[]; links?: { from: number; to: number }[] },
  root: number,
): Graph => {
  const goneFragments = new Set(gone.fragments)
  const goneLinks = new Set(gone.links?.map((l) => linkKey(l.from, l.to)))
  const links = new Map(
    [...graph.links].filter(
      ([key, l]) =>
        !goneLinks.has(key) &&
        !goneFragments.has(l.from) &&
        !goneFragments.has(l.to),
    ),
  )
  const after = new Map<number, number[]>()
  for (const { from, to } of links.values()) {
    after.set(from, [...(after.get(from) ?? []), to])
  }
  const reached = new Set([root])
  const queue = [root]
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const to of after.get(id) ?? []) {
      if (!reached.has(to)) {
        reached.add(to)
        queue.push(to)
      }
    }
  }
  return {
    fragments: new Map([...graph.fragments].filter(([id]) => reached.has(id))),
    links: new Map(
      [...links].filter(([, l]) => reached.has(l.from) && reached.has(l.to)),
    ),
  }
}
