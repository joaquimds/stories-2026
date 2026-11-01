import { describe, expect, it } from 'vitest'
import { last, present } from './present.ts'

describe('present', () => {
  it('passes values through, including falsy ones', () => {
    expect(present(0)).toBe(0)
    expect(present('')).toBe('')
    expect(present(false)).toBe(false)
  })

  it('throws on undefined and null', () => {
    expect(() => present([1][1])).toThrow()
    expect(() => present(null)).toThrow()
  })
})

describe('last', () => {
  it('takes the last item', () => {
    expect(last([1, 2, 3])).toBe(3)
  })

  it('throws on an empty array', () => {
    expect(() => last([])).toThrow()
  })
})
