import { type Migration, Migrator } from 'kysely/migration'
import type { Db } from './index.ts'
import * as m0001 from './migrations/0001_init.ts'
import * as m0002 from './migrations/0002_foreign_key_indexes.ts'

// Listed statically so migrations are bundled with the server build
const migrations: Record<string, Migration> = {
  '0001_init': m0001,
  '0002_foreign_key_indexes': m0002,
}

export const migrate = async (db: Db) => {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
    migrationTableSchema: 'app',
  })
  const { error, results } = await migrator.migrateToLatest()
  for (const result of results ?? []) {
    if (result.status === 'Error') {
      console.error(`Migration ${result.migrationName} failed`)
    } else if (result.status === 'Success') {
      console.info(`Migration ${result.migrationName} applied`)
    }
  }
  if (error) {
    throw error
  }
}
