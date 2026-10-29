import { sql } from 'kysely'
import type { Db } from '../db/index.ts'
import { pathPermalinks } from '../data/paths.ts'
import { reportEmail } from '../email/templates.ts'
import { env } from '../env.ts'
import { enqueue } from './boss.ts'

export const sendReportEmail = async (db: Db, reportId: number) => {
  const to = env().ADMIN_EMAIL
  if (!to) {
    return
  }
  const report = await db
    .selectFrom('reports as r')
    .innerJoin('sentences as s', 's.id', 'r.sentence_id')
    .innerJoin('paths as origin', (join) =>
      join
        .onRef('origin.sentence_id', '=', 's.id')
        .on(
          sql<boolean>`origin.parent_id is not distinct from s.written_under_path_id`,
        ),
    )
    .select(['s.id', 's.content', 'origin.id as origin_path_id'])
    .where('r.id', '=', reportId)
    .executeTakeFirst()
  if (!report) {
    return
  }
  const permalinks = await pathPermalinks(db, [report.origin_path_id])
  const path = permalinks.get(report.origin_path_id)?.permalink ?? '/'
  await db
    .transaction()
    .execute((trx) =>
      enqueue(
        trx,
        'send-email',
        reportEmail(to, report.id, report.content, path),
      ),
    )
}
