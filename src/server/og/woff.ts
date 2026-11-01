// Reads WOFF (version 1) fonts with Node's own zlib: the glyph widths needed
// to wrap text, and the plain sfnt (TTF/OTF) that resvg can load.
// Spec: https://www.w3.org/TR/WOFF/ and the OpenType tables it wraps.
import { inflateSync } from 'node:zlib'

export type Woff = {
  flavor: number
  tables: Map<string, Buffer>
}

export const parseWoff = (data: Buffer): Woff => {
  if (data.toString('latin1', 0, 4) !== 'wOFF') {
    throw new Error('Not a WOFF font')
  }
  const flavor = data.readUInt32BE(4)
  const numTables = data.readUInt16BE(12)
  const tables = new Map<string, Buffer>()
  for (let i = 0; i < numTables; i++) {
    const entry = 44 + i * 20
    const tag = data.toString('latin1', entry, entry + 4)
    const offset = data.readUInt32BE(entry + 4)
    const compLength = data.readUInt32BE(entry + 8)
    const origLength = data.readUInt32BE(entry + 12)
    const stored = data.subarray(offset, offset + compLength)
    tables.set(tag, compLength < origLength ? inflateSync(stored) : stored)
  }
  return { flavor, tables }
}

const table = (font: Woff, tag: string) => {
  const data = font.tables.get(tag)
  if (!data) {
    throw new Error(`Font has no ${tag} table`)
  }
  return data
}

// The font as a plain sfnt: a header, a sorted table directory, then each
// table padded to four bytes. Checksums are copied as zero; renderers that
// load fonts for drawing don't verify them.
export const toSfnt = (font: Woff): Buffer => {
  const tags = [...font.tables.keys()].sort()
  const numTables = tags.length
  let entrySelector = 0
  while (2 ** (entrySelector + 1) <= numTables) {
    entrySelector++
  }
  const searchRange = 2 ** entrySelector * 16
  const header = Buffer.alloc(12 + numTables * 16)
  header.writeUInt32BE(font.flavor, 0)
  header.writeUInt16BE(numTables, 4)
  header.writeUInt16BE(searchRange, 6)
  header.writeUInt16BE(entrySelector, 8)
  header.writeUInt16BE(numTables * 16 - searchRange, 10)
  const bodies: Buffer[] = []
  let offset = header.length
  tags.forEach((tag, i) => {
    const data = table(font, tag)
    const entry = 12 + i * 16
    header.write(tag, entry, 'latin1')
    header.writeUInt32BE(0, entry + 4)
    header.writeUInt32BE(offset, entry + 8)
    header.writeUInt32BE(data.length, entry + 12)
    const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4)
    data.copy(padded)
    bodies.push(padded)
    offset += padded.length
  })
  return Buffer.concat([header, ...bodies])
}

// Character code point → glyph index, from the cmap's Unicode subtable
const glyphLookup = (cmap: Buffer): ((codePoint: number) => number) => {
  const numTables = cmap.readUInt16BE(2)
  const subtables = new Map<string, number>()
  for (let i = 0; i < numTables; i++) {
    const record = 4 + i * 8
    const platform = cmap.readUInt16BE(record)
    const encoding = cmap.readUInt16BE(record + 2)
    subtables.set(`${platform}-${encoding}`, cmap.readUInt32BE(record + 4))
  }
  const candidates = ['3-10', '0-4', '3-1', '0-3']
  for (const key of candidates) {
    const start = subtables.get(key)
    if (start === undefined) {
      continue
    }
    const format = cmap.readUInt16BE(start)
    if (format === 12) {
      const groups = cmap.readUInt32BE(start + 12)
      return (codePoint) => {
        for (let i = 0; i < groups; i++) {
          const group = start + 16 + i * 12
          const first = cmap.readUInt32BE(group)
          const last = cmap.readUInt32BE(group + 4)
          if (codePoint >= first && codePoint <= last) {
            return cmap.readUInt32BE(group + 8) + codePoint - first
          }
        }
        return 0
      }
    }
    if (format === 4) {
      const segments = cmap.readUInt16BE(start + 6) / 2
      const ends = start + 14
      const starts = ends + segments * 2 + 2
      const deltas = starts + segments * 2
      const rangeOffsets = deltas + segments * 2
      return (codePoint) => {
        if (codePoint > 0xffff) {
          return 0
        }
        for (let i = 0; i < segments; i++) {
          if (codePoint > cmap.readUInt16BE(ends + i * 2)) {
            continue
          }
          const first = cmap.readUInt16BE(starts + i * 2)
          if (codePoint < first) {
            return 0
          }
          const delta = cmap.readInt16BE(deltas + i * 2)
          const rangeOffsetAt = rangeOffsets + i * 2
          const rangeOffset = cmap.readUInt16BE(rangeOffsetAt)
          if (rangeOffset === 0) {
            return (codePoint + delta) & 0xffff
          }
          const glyph = cmap.readUInt16BE(
            rangeOffsetAt + rangeOffset + (codePoint - first) * 2,
          )
          return glyph === 0 ? 0 : (glyph + delta) & 0xffff
        }
        return 0
      }
    }
  }
  throw new Error('Font has no Unicode cmap subtable')
}

export type FontMetrics = {
  unitsPerEm: number
  // Advance width of a character, in font units; missing characters use
  // the font's fallback glyph
  advance: (codePoint: number) => number
}

export const fontMetrics = (font: Woff): FontMetrics => {
  const unitsPerEm = table(font, 'head').readUInt16BE(18)
  const longMetrics = table(font, 'hhea').readUInt16BE(34)
  const hmtx = table(font, 'hmtx')
  const glyphFor = glyphLookup(table(font, 'cmap'))
  const widthOfGlyph = (glyph: number) =>
    hmtx.readUInt16BE(Math.min(glyph, longMetrics - 1) * 4)
  const cache = new Map<number, number>()
  return {
    unitsPerEm,
    advance: (codePoint) => {
      let width = cache.get(codePoint)
      if (width === undefined) {
        width = widthOfGlyph(glyphFor(codePoint))
        cache.set(codePoint, width)
      }
      return width
    },
  }
}
