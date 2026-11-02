import { describe, expect, it } from 'vitest'
import { walkTargets } from './walk.ts'

// The root (0), then A (1), B (2) and C (3), each written after the last.
// C continues to D (4) and loops back to A; A also branches to E (5),
// which goes on to F (6). G (7) has no route from the story.
const defaults: Record<number, number | null> = {
  0: null,
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  5: 1,
  6: 5,
  7: 0,
}
const story = {
  links: [
    { from: 0, to: 1 },
    { from: 1, to: 2 },
    { from: 2, to: 3 },
    { from: 3, to: 4 },
    { from: 3, to: 1 },
    { from: 1, to: 5 },
    { from: 5, to: 6 },
  ],
  defaultParent: (id: number) => defaults[id] ?? null,
  path: [0, 1, 2, 3],
  prefixes: ['/', '/s/1', '/s/2', '/s/T'],
  first: 0,
}

describe('walkTargets', () => {
  const targets = walkTargets(story)

  it('goes back along the story to a sentence on it', () => {
    expect(targets.get(2)).toBe('/s/2')
    // Even where a loop also leads there
    expect(targets.get(1)).toBe('/s/1')
    // Titled stories keep their slugs
    expect(targets.get(3)).toBe('/s/T')
  })

  it('goes on from where you are', () => {
    expect(targets.get(4)).toBe('/s/4')
  })

  it('takes the shortest route from the latest point on the story', () => {
    // From C, round the loop to A, then to E: the story so far is kept
    expect(targets.get(5)).toBe('/s/5.1-3')
    expect(targets.get(6)).toBe('/s/6.1-3')
  })

  it('falls back on sentences with no route from the story', () => {
    expect(targets.has(7)).toBe(false)
  })

  it('starts from earlier on the story when there is no route from its end', () => {
    // Without the loop, nothing after C reaches G, but B does
    const fromB = walkTargets({
      ...story,
      links: [
        ...story.links.filter((l) => !(l.from === 3 && l.to === 1)),
        { from: 2, to: 7 },
      ],
    })
    expect(fromB.get(7)).toBe('/s/7.7-2')
  })
})
