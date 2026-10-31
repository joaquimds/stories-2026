import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authorSearchSchema } from '../../domain/search.ts'
import { db } from '../db/index.ts'
import { favourites } from '../data/likes.ts'
import { myFragments } from '../data/sentences.ts'
import { library } from '../data/titles.ts'
import { findAuthor } from '../data/users.ts'

const cursor = (search: { after?: number; before?: number }) =>
  search.after ? { after: search.after } : { before: search.before }

// A writer's page: their profile and one tab of their work
export const getAuthorPage = createServerFn({ method: 'GET' })
  .validator(
    z.object({ name: z.string().min(1).max(100), search: authorSearchSchema }),
  )
  .handler(async ({ data: { name, search } }) => {
    const database = db()
    const author = await findAuthor(database, name)
    if (!author) {
      throw notFound()
    }
    const tab = search.tab ?? 'fragments'
    const viewer = { id: author.id, name: author.name }
    if (tab === 'titled') {
      const page = await library(
        database,
        { order: 'newest', ...cursor(search) },
        undefined,
        { authorId: author.id },
      )
      return { author, tab, stories: page, fragments: null }
    }
    if (tab === 'favourites') {
      const page = await favourites(database, viewer, {
        order: 'newest',
        ...cursor(search),
      })
      return { author, tab, stories: page, fragments: null }
    }
    const page = await myFragments(database, viewer, {
      order: 'newest',
      ...cursor(search),
    })
    return { author, tab, stories: null, fragments: page }
  })
