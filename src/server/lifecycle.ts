import { db, destroyDb } from './db/index.ts'
import { migrate } from './db/migrate.ts'
import { env } from './env.ts'
import { startBoss, stopBoss } from './jobs/boss.ts'
import { registerWorkers } from './jobs/workers.ts'

let starting: Promise<void> | undefined

// Validate env → migrate → start pg-boss with workers and schedules.
// Idempotent, so the dev server can call it on every request.
export const start = () => {
  starting ??= (async () => {
    const { DATABASE_URL } = env()
    await migrate(db())
    await startBoss(DATABASE_URL)
    await registerWorkers(db())
  })()
  return starting
}

export const stop = async () => {
  await stopBoss()
  await destroyDb()
  starting = undefined
}
