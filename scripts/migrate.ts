import { createDb } from '../src/server/db/index.ts'
import { migrate } from '../src/server/db/migrate.ts'

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error('DATABASE_URL is required')
}
const db = createDb(url, 1)
await migrate(db)
await db.destroy()
