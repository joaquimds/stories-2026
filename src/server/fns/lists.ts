import { createServerFn } from '@tanstack/react-start'
import { toPageParams } from '../../domain/pagination.ts'
import { listSearchSchema, recentSearchSchema } from '../../domain/search.ts'
import { requireUser } from '../auth/request.ts'
import { db } from '../db/index.ts'
import { favourites } from '../data/likes.ts'
import { myLinks } from '../data/links.ts'
import { recentSentences } from '../data/recent.ts'
import { myFragments } from '../data/sentences.ts'
import { getStats } from '../data/stats.ts'
import { library } from '../data/titles.ts'

// Account lists have a fixed order
const keysetParams = (
  search: { after?: number; before?: number },
  order: 'newest' | 'oldest',
) =>
  search.after
    ? { order, after: search.after }
    : { order, before: search.before }

export const getLibrary = createServerFn({ method: 'GET' })
  .validator(listSearchSchema)
  .handler(({ data }) => library(db(), toPageParams(data, 'popular'), data.q))

export const getFavourites = createServerFn({ method: 'GET' })
  .validator(listSearchSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()
    return favourites(db(), user, keysetParams(data, 'newest'), data.q)
  })

export const getFragments = createServerFn({ method: 'GET' })
  .validator(listSearchSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()
    return myFragments(db(), user, keysetParams(data, 'oldest'), data.q)
  })

export const getLinks = createServerFn({ method: 'GET' })
  .validator(listSearchSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()
    return myLinks(db(), user, keysetParams(data, 'oldest'), data.q)
  })

export const getStatsPage = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { computedAt, ...stats } = await getStats(db())
    return { ...stats, computedAt: computedAt.toISOString() }
  },
)

// Newest first, loose ends too: old endings nobody took up would otherwise
// fill the list
export const getRecent = createServerFn({ method: 'GET' })
  .validator(recentSearchSchema)
  .handler(({ data }) =>
    recentSentences(db(), keysetParams(data, 'newest'), {
      looseEnds: data.loose,
    }),
  )
