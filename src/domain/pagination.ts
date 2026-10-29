import { z } from 'zod'

export const PAGE_SIZE = 10
export const POPULAR_PAGES = 10

export const ORDERS = [
  { label: 'Popular', value: 'popular' },
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
] as const

export type Order = (typeof ORDERS)[number]['value']

export type PageParams =
  | { order: 'popular'; page?: number }
  | { order: 'newest' | 'oldest'; after?: number; before?: number }

export type Page<T> = {
  items: T[]
  prev: PageParams | null
  next: PageParams | null
  // Popular ordering only shows the top POPULAR_PAGES pages
  truncated?: boolean
}

const optionalId = z.coerce
  .number()
  .int()
  .positive()
  .optional()
  .catch(undefined)

export const pageSearchSchema = z.object({
  order: z.enum(['popular', 'newest', 'oldest']).optional().catch(undefined),
  page: z.coerce
    .number()
    .int()
    .min(1)
    .max(POPULAR_PAGES)
    .optional()
    .catch(undefined),
  after: optionalId,
  before: optionalId,
})

export type PageSearch = z.infer<typeof pageSearchSchema>

export const pageParamsSchema = z.discriminatedUnion('order', [
  z.object({
    order: z.literal('popular'),
    page: z.number().int().min(1).max(POPULAR_PAGES).optional(),
  }),
  z.object({
    order: z.enum(['newest', 'oldest']),
    after: z.number().int().positive().optional(),
    before: z.number().int().positive().optional(),
  }),
])

export const toPageParams = (
  search: PageSearch,
  defaultOrder: Order,
): PageParams => {
  const order = search.order ?? defaultOrder
  if (order === 'popular') {
    return { order, page: search.page }
  }
  return search.after
    ? { order, after: search.after }
    : { order, before: search.before }
}

// Search params for a page, omitting defaults to keep URLs short
export const toPageSearch = (
  params: PageParams,
  defaultOrder: Order,
): PageSearch => ({
  order: params.order === defaultOrder ? undefined : params.order,
  page:
    params.order === 'popular' && params.page !== 1 ? params.page : undefined,
  after: params.order !== 'popular' ? params.after : undefined,
  before: params.order !== 'popular' ? params.before : undefined,
})
