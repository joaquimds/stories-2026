import {
  PAGE_SIZE,
  POPULAR_PAGES,
  type Page,
  type PageParams,
} from '../../domain/pagination.ts'

export type Keyset = { after?: number; before?: number }

// Builds a page from rows fetched with limit PAGE_SIZE + 1. For a `before`
// cursor the rows must have been fetched in reverse order.
export const keysetPage = <T>(
  rows: T[],
  params: Extract<PageParams, { order: 'newest' | 'oldest' }>,
  key: (item: T) => number,
): Page<T> => {
  const more = rows.length > PAGE_SIZE
  const items = rows.slice(0, PAGE_SIZE)
  const { order } = params
  if (params.before) {
    items.reverse()
    const first = items[0]
    const last = items.at(-1)
    return {
      items,
      prev: more && first ? { order, before: key(first) } : null,
      next: last ? { order, after: key(last) } : null,
    }
  }
  const first = items[0]
  const last = items.at(-1)
  return {
    items,
    prev: params.after && first ? { order, before: key(first) } : null,
    next: more && last ? { order, after: key(last) } : null,
  }
}

export const popularPage = <T>(rows: T[], page: number): Page<T> => {
  const more = rows.length > PAGE_SIZE
  return {
    items: rows.slice(0, PAGE_SIZE),
    prev: page > 1 ? { order: 'popular', page: page - 1 } : null,
    next:
      more && page < POPULAR_PAGES
        ? { order: 'popular', page: page + 1 }
        : null,
    truncated: more && page >= POPULAR_PAGES,
  }
}

export const popularOffset = (page = 1) => (page - 1) * PAGE_SIZE

// Comparison and direction for an id-ordered keyset query
export const keysetQuery = (
  params: Extract<PageParams, { order: 'newest' | 'oldest' }>,
) => {
  const ascending = params.order === 'oldest'
  if (params.before) {
    return {
      cursor: params.before,
      op: ascending ? ('<' as const) : ('>' as const),
      direction: ascending ? ('desc' as const) : ('asc' as const),
    }
  }
  return {
    cursor: params.after,
    op: ascending ? ('>' as const) : ('<' as const),
    direction: ascending ? ('asc' as const) : ('desc' as const),
  }
}

export const emptyPage = <T>(): Page<T> => ({
  items: [],
  prev: null,
  next: null,
})

export const searchPattern = (search: string) =>
  `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
