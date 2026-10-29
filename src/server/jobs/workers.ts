import { pruneRateLimits } from '../auth/rate-limit.ts'
import type { Db } from '../db/index.ts'
import { sendEmail } from '../email/smtp2go.ts'
import { type JobData, getBoss } from './boss.ts'
import { sendDigests } from './notification-digest.ts'
import { sendReportEmail } from './report-email.ts'

export const registerWorkers = async (db: Db) => {
  const boss = getBoss()
  await boss.work<JobData['send-email']>('send-email', async ([job]) => {
    if (job) {
      await sendEmail(job.data)
    }
  })
  await boss.work<JobData['report-email']>('report-email', async ([job]) => {
    if (job) {
      await sendReportEmail(db, job.data.reportId)
    }
  })
  await boss.work('notification-digest', async () => {
    const count = await sendDigests(db)
    await pruneRateLimits(db)
    console.info(`Queued ${count} notification digests`)
  })
  await boss.schedule('notification-digest', '0 18 * * *', null, {
    tz: 'Europe/London',
  })
}
