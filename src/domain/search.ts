import { z } from 'zod'
import { pageSearchSchema } from './pagination.ts'

export const LINK_DIRECTIONS = ['siblings', 'parents', 'children'] as const
export type LinkDirection = (typeof LINK_DIRECTIONS)[number]

const optionalId = z.coerce
  .number()
  .int()
  .positive()
  .optional()
  .catch(undefined)
const optionalSearch = z.coerce
  .string()
  .trim()
  .max(100)
  .optional()
  .catch(undefined)

// The story page has two lists: its children (unprefixed) and the link
// browser in the Write panel (prefixed with `l.`)
export const storySearchSchema = pageSearchSchema.extend({
  tab: z.enum(['write', 'link']).optional().catch(undefined),
  'l.dir': z.enum(LINK_DIRECTIONS).optional().catch(undefined),
  'l.from': optionalId,
  'l.q': optionalSearch,
  'l.after': optionalId,
  'l.before': optionalId,
})

export type StorySearch = z.infer<typeof storySearchSchema>

export const listSearchSchema = pageSearchSchema.extend({ q: optionalSearch })

export type ListSearch = z.infer<typeof listSearchSchema>

export const recentSearchSchema = pageSearchSchema.extend({
  // Only sentences that nothing follows yet
  loose: z.boolean().optional().catch(undefined),
})

export type RecentSearch = z.infer<typeof recentSearchSchema>

export const AUTHOR_TABS = ['fragments', 'titled', 'favourites'] as const

export const authorSearchSchema = pageSearchSchema.extend({
  tab: z.enum(AUTHOR_TABS).optional().catch(undefined),
})

export type AuthorSearch = z.infer<typeof authorSearchSchema>
