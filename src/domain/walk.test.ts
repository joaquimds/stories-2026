import { describe, expect, it } from 'vitest'
import { walkTargets } from './walk.ts'

// The story so far: the root (0), A (1), B (2) and C (3), each written
// after the last. C continues to D (4), which goes on to E (5), and loops
// back to A. G (7), written after the root, leads only into C.
const defaults: Record<number, number | null> = {
  0: null,
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  7: 0,
}
const story = {
  links: [
    { from: 0, to: 1 },
    { from: 1, to: 2 },
    { from: 2, to: 3 },
    { from: 3, to: 4 },
    { from: 4, to: 5 },
    { from: 3, to: 1 },
    { from: 7, to: 3 },
  ],
  defaultParent: (id: number) => defaults[id] ?? null,
  path: [0, 1, 2, 3],
  prefixes: ['/', '/s/1', '/s/2', '/s/Title'],
  steps: { 4: '/s/4', 1: '/s/1.1-3' },
  first: 0,
}

describe('walkTargets', () => {
  const targets = walkTargets(story)

  it('stays where you are', () => {
    expect(targets.get(3)).toBe('/s/Title')
  })

  it('takes a step on with the address the story page gives it', () => {
    expect(targets.get(4)).toBe('/s/4')
  })

  it('writes out longer walks on', () => {
    expect(targets.get(5)).toBe('/s/5')
  })

  it('takes a step on round a loop rather than going two steps back', () => {
    // A follows C: one step on, against two back
    expect(targets.get(1)).toBe('/s/1.1-3')
  })

  it('goes back when that is shorter than going round a loop', () => {
    // B is one step back, against two on (C, A, B)
    expect(targets.get(2)).toBe('/s/2')
  })

  it('goes back to the latest time a looping story passed a sentence', () => {
    // The story so far has been round the loop once: 0 A B C A B C
    const looped = walkTargets({
      ...story,
      path: [0, 1, 2, 3, 1, 2, 3],
      prefixes: ['/', '/s/1', '/s/2', '/s/3', '/s/a2', '/s/b2', '/s/c2'],
      steps: {},
    })
    expect(looped.get(2)).toBe('/s/b2')
  })

  it('goes back along the story and then on, when that is the shortest walk', () => {
    // From B, a new branch F (6): one step back to B, then one on
    const branching = walkTargets({
      ...story,
      links: [...story.links, { from: 2, to: 6 }],
      defaultParent: (id: number) => (id === 6 ? 2 : (defaults[id] ?? null)),
    })
    expect(branching.get(6)).toBe('/s/6')
  })

  it('leaves out sentences with no walk from the story', () => {
    // G only leads into C
    expect(targets.has(7)).toBe(false)
  })
})
