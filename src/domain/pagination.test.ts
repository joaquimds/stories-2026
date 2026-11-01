import { describe, expect, it } from 'vitest'
import { pageSearchSchema, toPageParams, toPageSearch } from './pagination.ts'

describe('pageSearchSchema', () => {
  it('coerces valid values and drops invalid ones', () => {
    expect(pageSearchSchema.parse({ order: 'newest', after: '12' })).toEqual({
      order: 'newest',
      after: 12,
    })
    expect(
      pageSearchSchema.parse({ order: 'sideways', page: '11', before: '-1' }),
    ).toEqual({})
  })
})

describe('toPageParams', () => {
  it('applies the default order', () => {
    expect(toPageParams({}, 'popular')).toEqual({ order: 'popular' })
    expect(toPageParams({ page: 3 }, 'popular')).toEqual({
      order: 'popular',
      page: 3,
    })
    expect(toPageParams({}, 'oldest')).toEqual({ order: 'oldest' })
  })

  it('ignores cursors for popular and page numbers for keysets', () => {
    expect(toPageParams({ after: 4 }, 'popular')).toEqual({ order: 'popular' })
    expect(
      toPageParams({ order: 'newest', page: 2, before: 9 }, 'popular'),
    ).toEqual({
      order: 'newest',
      before: 9,
    })
  })

  it('round trips through search params, omitting defaults', () => {
    expect(toPageSearch({ order: 'popular', page: 1 }, 'popular')).toEqual({})
    const params = { order: 'newest' as const, after: 7 }
    expect(toPageParams(toPageSearch(params, 'popular'), 'popular')).toEqual(
      params,
    )
  })
})
