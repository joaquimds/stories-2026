import { sql } from 'kysely'
import { ActionError } from '../../domain/errors.ts'
import type { Db } from '../db/index.ts'

export type Limit = { max: number; windowSeconds: number }

export const LIMITS = {
  login: { max: 10, windowSeconds: 15 * 60 },
  register: { max: 5, windowSeconds: 60 * 60 },
  forgotPassword: { max: 5, windowSeconds: 60 * 60 },
  report: { max: 20, windowSeconds: 60 * 60 },
} satisfies Record<string, Limit>

// Fixed-window counter. Returns false once `key` exceeds the limit.
export const hit = async (
  db: Db,
  key: string,
  { max, windowSeconds }: Limit,
) => {
  const { rows } = await sql<{ count: number }>`
    insert into app.rate_limits (key, window_start)
    values (${key}, to_timestamp(floor(extract(epoch from now()) / ${windowSeconds}) * ${windowSeconds}))
    on conflict (key, window_start)
      do update set count = app.rate_limits.count + 1
    returning count
  `.execute(db)
  return (rows[0]?.count ?? 0) <= max
}

// Checks every key so each window counts the attempt
export const enforceLimit = async (db: Db, keys: string[], limit: Limit) => {
  const results = await Promise.all(keys.map((key) => hit(db, key, limit)))
  if (results.includes(false)) {
    throw new ActionError('rateLimited')
  }
}

export const pruneRateLimits = (db: Db) =>
  db
    .deleteFrom('rate_limits')
    .where('window_start', '<', sql<Date>`now() - interval '1 day'`)
    .execute()
