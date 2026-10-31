import { describe, expect, it } from 'vitest'
import { safeNext } from './drafts.ts'

describe('safeNext', () => {
  it('keeps same-site paths', () => {
    expect(safeNext('/s/The_Bridge')).toBe('/s/The_Bridge')
    expect(safeNext('/')).toBe('/')
  })

  it.each([
    undefined,
    '',
    'https://evil.example',
    '//evil.example',
    'javascript:alert(1)',
    7,
  ])('refuses %j', (next) => {
    expect(safeNext(next)).toBe('/')
  })
})
