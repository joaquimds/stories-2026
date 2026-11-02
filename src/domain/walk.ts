import { present } from './present.ts'
import { encodeThread, permalink } from './thread.ts'

// Where each sentence on the map leads, so moving around it is walking:
// - a sentence on the story goes back to it along the story (its latest
//   appearance, if the story loops through it);
// - any other goes on along the shortest route loaded, from the latest
//   point on the story that has one, so the story so far is kept;
// - a sentence with no route from the story is left out, for its own story.
// `first` is the earliest point on the story that is loaded.
export const walkTargets = ({
  links,
  defaultParent,
  path,
  prefixes,
  first,
}: {
  links: Iterable<{ from: number; to: number }>
  defaultParent: (sentenceId: number) => number | null
  path: number[]
  prefixes: string[]
  first: number
}) => {
  const targets = new Map<number, string>()
  for (const [i, id] of path.entries()) {
    targets.set(id, prefixes[i] ?? '/')
  }
  const after = new Map<number, number[]>()
  for (const { from, to } of links) {
    after.set(from, [...(after.get(from) ?? []), to])
  }
  for (let start = path.length - 1; start >= first; start--) {
    const from = present(path[start])
    // Breadth first, so each route found is a shortest one
    const previous = new Map<number, number>([[from, from]])
    let level = [from]
    while (level.length) {
      const next: number[] = []
      for (const id of level) {
        for (const to of after.get(id) ?? []) {
          if (previous.has(to)) {
            continue
          }
          previous.set(to, id)
          next.push(to)
          if (targets.has(to)) {
            continue
          }
          const route = [to]
          for (let at = id; at !== from; at = present(previous.get(at))) {
            route.unshift(at)
          }
          try {
            targets.set(
              to,
              permalink(
                encodeThread(
                  [...path.slice(0, start + 1), ...route],
                  defaultParent,
                ),
              ),
            )
          } catch {
            // Not a story that can be written down; left to its own
          }
        }
      }
      level = next
    }
  }
  return targets
}
