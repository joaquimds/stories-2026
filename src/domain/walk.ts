import { present } from './present.ts'
import { encodeThread, permalink } from './thread.ts'

// Where each sentence on the map leads: the shortest walk there from where
// you are, over the links the map shows. A step back along the story counts
// the same as a step forward, and a tie goes forward. A walk back to a
// point on the story, or one step on, has the address the story page gives
// it; longer walks are written out here. A sentence with no walk is left
// out, for its own story.
//
// `steps` are the addresses of the current sentence's continuations.
export const walkTargets = ({
  links,
  defaultParent,
  path,
  prefixes,
  steps,
}: {
  links: Iterable<{ from: number; to: number }>
  defaultParent: (sentenceId: number) => number | null
  path: number[]
  prefixes: string[]
  steps: Record<number, string>
}) => {
  const after = new Map<number, number[]>()
  for (const { from, to } of links) {
    after.set(from, [...(after.get(from) ?? []), to])
  }
  const end = path.length - 1
  // The best walk found to each sentence: back to point `at` on the story,
  // then on along `route`
  const best = new Map<number, { cost: number; at: number; route: number[] }>()
  // Nearest points first, so that a tie keeps the walk with fewer steps back
  for (let at = end; at >= 0; at--) {
    const back = end - at
    const start = present(path[at])
    const routes = new Map<number, number[]>([[start, []]])
    let level = [start]
    for (let distance = 0; level.length; distance++) {
      const next: number[] = []
      for (const id of level) {
        const route = present(routes.get(id))
        const known = best.get(id)
        if (!known || back + distance < known.cost) {
          best.set(id, { cost: back + distance, at, route })
        }
        for (const to of after.get(id) ?? []) {
          if (!routes.has(to)) {
            routes.set(to, [...route, to])
            next.push(to)
          }
        }
      }
      level = next
    }
  }

  const targets = new Map<number, string>()
  for (const [id, { at, route }] of best) {
    const step = at === end && route.length === 1 ? steps[id] : undefined
    if (!route.length) {
      targets.set(id, prefixes[at] ?? '/')
    } else if (step) {
      targets.set(id, step)
    } else {
      try {
        targets.set(
          id,
          permalink(
            encodeThread([...path.slice(0, at + 1), ...route], defaultParent),
          ),
        )
      } catch {
        // Not a story that can be written down; left to its own
      }
    }
  }
  return targets
}
