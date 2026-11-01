import { describe, expect, it } from 'vitest'
import { lastForwardedFor } from './forwarded.ts'

describe('lastForwardedFor', () => {
  it('takes the address the nearest proxy added', () => {
    expect(lastForwardedFor('6.6.6.6, 203.0.113.7')).toBe('203.0.113.7')
    expect(lastForwardedFor('203.0.113.7')).toBe('203.0.113.7')
    expect(lastForwardedFor('6.6.6.6,2001:db8::1 ')).toBe('2001:db8::1')
  })

  it('has nothing without a header', () => {
    expect(lastForwardedFor(null)).toBeUndefined()
    expect(lastForwardedFor('')).toBeUndefined()
    expect(lastForwardedFor(' , ')).toBeUndefined()
  })
})
