import { ActionError } from '../../domain/errors.ts'
import type { Db } from '../db/index.ts'
import { env } from '../env.ts'
import { enqueue } from '../jobs/boss.ts'

export const reportSentence = async (
  trx: Db,
  reporterId: number | null,
  sentenceId: number,
) => {
  const sentence = await trx
    .selectFrom('sentences')
    .select('id')
    .where('id', '=', sentenceId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()
  if (!sentence) {
    throw new ActionError('notFound')
  }
  const { id } = await trx
    .insertInto('reports')
    .values({ sentence_id: sentenceId, reporter_id: reporterId })
    .returning('id')
    .executeTakeFirstOrThrow()
  if (env().ADMIN_EMAIL) {
    await enqueue(trx, 'report-email', { reportId: id })
  }
  return { reported: true }
}
