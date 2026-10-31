import { describe, expect, it } from 'vitest'
import { renderStoryImage } from './image.ts'

describe('renderStoryImage', () => {
  it('draws a PNG, even for the longest title and sentence', async () => {
    const png = await renderStoryImage({
      title: 'x'.repeat(100),
      sentences: ['y '.repeat(140), 'A <tag> & more.'],
    })
    expect(png.subarray(1, 4).toString()).toBe('PNG')
  })
})
