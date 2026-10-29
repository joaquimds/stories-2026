import { describe, expect, it } from 'vitest'
import {
  type ThreadGraph,
  decodeThread,
  encodeThread,
  parseThread,
} from './thread.ts'

// 1 and 10 are beginnings. 2 was written under 1, 3 under 1→2, 4 under 1→2.
// Users linked 3→2 (a loop), 10→3 and 4→3.
const defaults = new Map<number, number | null>([
  [1, null],
  [2, 1],
  [3, 2],
  [4, 2],
  [10, null],
])
const links = new Set(['1-2', '2-3', '2-4', '3-2', '10-3', '4-3'])

const graph: ThreadGraph = {
  defaultParent: (id) => defaults.get(id),
  hasLink: (from, to) => links.has(`${from}-${to}`),
}
const defaultParent = graph.defaultParent

describe('parseThread', () => {
  it('parses a leaf and steps', () => {
    expect(parseThread('12.5-3.7-1')).toEqual({
      leaf: 12,
      steps: [
        { from: 5, to: 3 },
        { from: 7, to: 1 },
      ],
    })
  })

  it.each(['', 'abc', '1.', '1.2', '1-2', '0', '1.0-2', '1.2-3.', '01x'])(
    'rejects %j',
    (value) => {
      expect(parseThread(value)).toBeNull()
    },
  )
})

describe('encodeThread and decodeThread', () => {
  it.each([
    [[1], '1'],
    [[1, 2], '2'],
    [[1, 2, 3], '3'],
    [[1, 2, 4, 3], '3.3-4'],
    [[10, 3], '3.3-10'],
    [[10, 3, 2], '2.2-3.3-10'],
    [[1, 2, 3, 2, 3, 2], '2.2-3.2-3'],
    [[1, 2, 3, 2, 4, 3, 2, 3], '3.2-3.3-4.2-3'],
  ])('round trips %j as %s', (ids, thread) => {
    expect(encodeThread(ids, defaultParent)).toBe(thread)
    expect(decodeThread(thread, graph)).toEqual(ids)
  })

  it('rejects steps without a link', () => {
    expect(decodeThread('2.2-4', graph)).toBeNull()
  })

  it('rejects non-canonical steps that repeat the default parent', () => {
    expect(decodeThread('3.3-2', graph)).toBeNull()
  })

  it('rejects unknown sentences', () => {
    expect(decodeThread('99', graph)).toBeNull()
    expect(decodeThread('3.3-99', graph)).toBeNull()
  })

  it('rejects steps that are never reached', () => {
    expect(decodeThread('3.4-3', graph)).toBeNull()
    expect(decodeThread('3.3-4.3-4', graph)).toBeNull()
  })

  it('refuses to encode a path that does not start at a beginning', () => {
    expect(() => encodeThread([2, 3], defaultParent)).toThrow()
  })
})
