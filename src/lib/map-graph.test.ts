import { describe, expect, it } from 'vitest'
import type { MapFragment } from '../server/data/map.ts'
import { EMPTY, merge, removeFromGraph } from './map-graph.ts'

const fragment = (id: number): MapFragment => ({
  id,
  content: `${id}`,
  continuations: 0,
  origin: `/s/${id}`,
  defaultParent: null,
})

// The root (0) leads to A (1), which leads to B (2) and C (3); C leads to
// D (4), and B links on to D too
const graph = merge(EMPTY, {
  fragments: [0, 1, 2, 3, 4].map(fragment),
  links: [
    { from: 0, to: 1 },
    { from: 1, to: 2 },
    { from: 1, to: 3 },
    { from: 3, to: 4 },
    { from: 2, to: 4 },
  ],
  steps: {},
})

describe('removeFromGraph', () => {
  it('takes out a deleted fragment and its links', () => {
    const after = removeFromGraph(graph, { fragments: [2] }, 0)
    expect([...after.fragments.keys()]).toEqual([0, 1, 3, 4])
    expect([...after.links.keys()]).toEqual(['0-1', '1-3', '3-4'])
  })

  it('takes out what can no longer be reached from the beginning', () => {
    // Without C, D is still reached through B
    expect([
      ...removeFromGraph(graph, { fragments: [3] }, 0).fragments.keys(),
    ]).toEqual([0, 1, 2, 4])
    // Without A, nothing is
    expect([
      ...removeFromGraph(graph, { fragments: [1] }, 0).fragments.keys(),
    ]).toEqual([0])
  })

  it('takes out an unlinked link, and a fragment it alone reached', () => {
    const unlinked = removeFromGraph(graph, { links: [{ from: 2, to: 4 }] }, 0)
    expect(unlinked.links.has('2-4')).toBe(false)
    expect(unlinked.fragments.has(4)).toBe(true)
    const alone = removeFromGraph(unlinked, { links: [{ from: 3, to: 4 }] }, 0)
    expect(alone.fragments.has(4)).toBe(false)
  })
})
