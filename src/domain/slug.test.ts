import { describe, expect, it } from 'vitest'
import { titleToSlug, validateTitle } from './slug.ts'

describe('titleToSlug', () => {
  it.each([
    ['A Tale', 'A_Tale'],
    ['  spaced   out  ', 'spaced_out'],
    ['what/why?#100%', 'what_why_100'],
    ['Café días', 'Café_días'],
  ])('%j → %j', (title, slug) => {
    expect(titleToSlug(title)).toBe(slug)
  })
})

describe('validateTitle', () => {
  it('accepts ordinary titles', () => {
    expect(validateTitle('The Garden')).toBeNull()
    expect(validateTitle('1984 revisited')).toBeNull()
  })

  it.each(['', '   ', '12', '12.3-4', '///', 'x'.repeat(101)])(
    'rejects %j',
    (title) => {
      expect(validateTitle(title)).not.toBeNull()
    },
  )
})
