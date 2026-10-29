import { Kysely, PostgresDialect, WithSchemaPlugin } from 'kysely'
import pg from 'pg'
import { env } from '../env.ts'
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
