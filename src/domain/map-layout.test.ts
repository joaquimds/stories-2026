import { describe, expect, it } from 'vitest'
import { layoutTree } from './map-layout.ts'

const spacing = { column: 100, row: 10 }

describe('layoutTree', () => {
  it('gives leaves their own rows and centres parents on their children', () => {
    const { positions, width, height } = layoutTree(
      [
        { key: 'a', parent: null },
        { key: 'b', parent: 'a' },
        { key: 'c', parent: 'a' },
        { key: 'd', parent: 'b' },
        { key: 'e', parent: 'b' },
      ],
      spacing,
    )
    expect(Object.fromEntries(positions)).toEqual({
      d: { x: 200, y: 0 },
      e: { x: 200, y: 10 },
      b: { x: 100, y: 5 },
      c: { x: 100, y: 20 },
      a: { x: 0, y: 12.5 },
    })
    expect([width, height]).toEqual([200, 20])
  })

  it('handles a single node and an empty tree', () => {
    expect(layoutTree([{ key: 'a', parent: null }], spacing).height).toBe(0)
    expect(layoutTree([], spacing).positions.size).toBe(0)
  })

  it('lays out a very deep chain', () => {
    const nodes = Array.from({ length: 5000 }, (_, i) => ({
      key: String(i),
      parent: i ? String(i - 1) : null,
    }))
    expect(layoutTree(nodes, spacing).positions.get('0')).toEqual({
      x: 0,
      y: 0,
    })
  })
})
