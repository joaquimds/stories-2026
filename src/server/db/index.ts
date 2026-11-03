import { Kysely, PostgresDialect, WithSchemaPlugin } from 'kysely'
import pg from 'pg'
import { env } from '../env.ts'
import { countQuery } from '../timing.ts'
import type { DB } from './types.ts'

// bigint ids and counts fit comfortably in a JS number
pg.types.setTypeParser(pg.types.builtins.INT8, Number)

export type Db = Kysely<DB>

export const createDb = (connectionString: string, max = 5): Db =>
  new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString, max }),
    }),
    plugins: [new WithSchemaPlugin('app')],
    // Adds each query's time to its request's Server-Timing
    log: (event) => countQuery(event.queryDurationMillis),
  })

let instance: Db | undefined

export const db = (): Db => {
  instance ??= createDb(env().DATABASE_URL)
  return instance
}

export const destroyDb = async () => {
  await instance?.destroy()
  instance = undefined
}

// Runs `fn` in a transaction, joining the caller's if there is one
export const inTransaction = <T>(db: Db, fn: (trx: Db) => Promise<T>) =>
  db.isTransaction ? fn(db) : db.transaction().execute(fn)
