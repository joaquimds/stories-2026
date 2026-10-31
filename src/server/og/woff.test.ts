import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { fontMetrics, parseWoff, toSfnt } from './woff.ts'

const require = createRequire(import.meta.url)
const font = parseWoff(
  readFileSync(
    require.resolve('@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff'),
  ),
)

describe('fontMetrics', () => {
  // Widths a browser measures for EB Garamond, in font units
  it.each([
    ['W', 916],
    ['i', 245],
    ['é', 390],
    [' ', 200],
  ])('reads the width of %j', (char, width) => {
    const metrics = fontMetrics(font)
    expect(metrics.unitsPerEm).toBe(1000)
    expect(metrics.advance(char.codePointAt(0)!)).toBe(width)
  })

  it('uses the placeholder glyph for characters the font lacks', () => {
    // EB Garamond's .notdef glyph is 500 units wide
    expect(fontMetrics(font).advance(0x4e2d)).toBe(500)
  })
})

describe('toSfnt', () => {
  it('writes a sorted table directory with every table', () => {
    const sfnt = toSfnt(font)
    const numTables = sfnt.readUInt16BE(4)
    expect(numTables).toBe(font.tables.size)
    const tags = Array.from({ length: numTables }, (_, i) =>
      sfnt.toString('latin1', 12 + i * 16, 16 + i * 16),
    )
    expect(tags).toEqual([...tags].sort())
    const head = tags.indexOf('head')
    const offset = sfnt.readUInt32BE(12 + head * 16 + 8)
    // The head table's magic number survives the round trip
    expect(sfnt.readUInt32BE(offset + 12)).toBe(0x5f0f3cf5)
  })
})
