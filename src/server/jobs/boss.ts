import { PgBoss, fromKysely } from 'pg-boss'
import type { Db } from '../db/index.ts'
import type { Email } from '../email/smtp2go.ts'

export type JobData = {
  'send-email': Email
  'notification-digest': Record<string, never>
  'report-email': { reportId: number }
}

export type QueueName = keyof JobData

export const QUEUES: QueueName[] = [
  'send-email',
  'notification-digest',
  'report-email',
]

let boss: PgBoss | undefined

export const getBoss = () => {
  if (!boss) {
    throw new Error('pg-boss has not been started')
  }
  return boss
}

// Starts pg-boss and creates its queues; workers are registered separately
export const startBoss = async (connectionString: string) => {
  boss = new PgBoss({ connectionString, schema: 'pgboss', max: 3 })
  boss.on('error', (error) => console.error('pg-boss error', error))
  await boss.start()
  for (const name of QUEUES) {
    await boss.createQueue(name, {
      retryLimit: 5,
      retryDelay: 30,
      retryBackoff: true,
    })
  }
  return boss
}

export const stopBoss = async () => {
  await boss?.stop({ graceful: true, timeout: 20_000 })
  boss = undefined
}

// Enqueues a job in the caller's transaction, so it only runs if the
// transaction commits
export const enqueue = <N extends QueueName>(
  trx: Db,
  name: N,
  data: JobData[N],
) => getBoss().send(name, data, { db: fromKysely(trx) })
