import { describe, expect, it } from 'vitest'
import { excerpt, renderStoryImage } from './image.tsx'

describe('excerpt', () => {
  it('keeps whole sentences while they fit', () => {
    expect(excerpt(['One.', 'Two.', 'Three.'], 9)).toBe('One. Two. …')
    expect(excerpt(['One.', 'Two.'], 100)).toBe('One. Two.')
  })

  it('cuts a single long sentence', () => {
    expect(excerpt(['abcdefghij'], 4)).toBe('abcd…')
  })
})

describe('renderStoryImage', () => {
  it('draws a PNG, even for the longest title and sentence', async () => {
    const png = await renderStoryImage({
      title: 'x'.repeat(100),
      sentences: ['y '.repeat(140)],
    })
    expect(png.subarray(1, 4).toString()).toBe('PNG')
  })
})
