import { describe, expect, it } from 'vitest'
import { wrapText } from './wrap.ts'

// One unit per character keeps the arithmetic obvious
const measure = (text: string) => text.length

describe('wrapText', () => {
  it('fills lines word by word', () => {
    expect(wrapText('the quick brown fox jumps', measure, 10, 5)).toEqual([
      'the quick',
      'brown fox',
      'jumps',
    ])
  })

  it('breaks words longer than a line', () => {
    expect(wrapText('abcdefghijkl xy', measure, 5, 5)).toEqual([
      'abcde',
      'fghij',
      'kl xy',
    ])
  })

  it('ends with an ellipsis when out of lines', () => {
    expect(wrapText('one two three four five six', measure, 9, 2)).toEqual([
      'one two',
      'three…',
    ])
  })
})
