import { describe, expect, it } from 'vitest'
import { radialLayout } from './map-layout.ts'

const ring = 100
const round = (n: number) => Math.round(n * 1000) / 1000

describe('radialLayout', () => {
  it('puts the root at the centre and each level on the next ring', () => {
    const { positions, radius } = radialLayout(
      [
        { key: 'a', parent: null },
        { key: 'b', parent: 'a' },
        { key: 'c', parent: 'a' },
        { key: 'd', parent: 'b' },
      ],
      { ring },
    )
    expect(positions.get('a')).toMatchObject({ x: 0, y: 0, depth: 0 })
    expect(positions.get('b')?.radius).toBe(100)
    expect(positions.get('d')?.radius).toBe(200)
    expect(radius).toBe(200)
  })

  it('shares the circle between leaves and centres parents on children', () => {
    const { positions } = radialLayout(
      [
        { key: 'a', parent: null },
        { key: 'b', parent: 'a' },
        { key: 'c', parent: 'a' },
        { key: 'd', parent: 'b' },
        { key: 'e', parent: 'b' },
      ],
      { ring },
    )
    const angles = (key: string) => round(positions.get(key)!.angle)
    // Three leaves, a third of a turn apart
    expect([angles('d'), angles('e'), angles('c')]).toEqual([
      0,
      round((2 * Math.PI) / 3),
      round((4 * Math.PI) / 3),
    ])
    expect(angles('b')).toBe(round(Math.PI / 3))
    // Positions follow from ring and angle
    const e = positions.get('e')!
    expect([round(e.x), round(e.y)]).toEqual([
      round(200 * Math.cos(e.angle)),
      round(200 * Math.sin(e.angle)),
    ])
  })

  it('handles a single node, an empty tree and a very deep chain', () => {
    expect(radialLayout([{ key: 'a', parent: null }], { ring }).radius).toBe(0)
    expect(radialLayout([], { ring }).positions.size).toBe(0)
    const chain = Array.from({ length: 5000 }, (_, i) => ({
      key: String(i),
      parent: i ? String(i - 1) : null,
    }))
    expect(radialLayout(chain, { ring }).positions.get('4999')?.depth).toBe(
      4999,
    )
  })
})
