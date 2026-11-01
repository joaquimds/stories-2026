import { sql } from 'kysely'
import { createDb } from '../../src/server/db/index.ts'
import { migrate } from '../../src/server/db/migrate.ts'

export default async () => {
  const url =
    process.env.TEST_DATABASE_URL ??
    'postgres://stories:stories@localhost:5432/stories_test'
  const db = createDb(url, 1)
  await sql`drop schema if exists app cascade`.execute(db)
  await sql`drop schema if exists pgboss cascade`.execute(db)
  await migrate(db)
  await db.destroy()
}
