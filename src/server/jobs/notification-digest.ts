import { type Db, inTransaction } from '../db/index.ts'
import { pathPermalinks } from '../data/paths.ts'
import { digestCredits, digestEntries } from '../data/rules.ts'
import { summarisePaths } from '../data/summaries.ts'
import { type Digest, digestEmail } from '../email/templates.ts'
import { enqueue } from './boss.ts'

const push = <T>(byName: Map<string, T[]>, name: string, item: T) => {
  byName.set(name, [...(byName.get(name) ?? []), item])
}

export const sendDigests = async (db: Db, cutoff = new Date()) => {
  const [entries, credits] = await Promise.all([
    digestEntries(db, cutoff),
    digestCredits(db, cutoff),
  ])
  const [permalinks, stories] = await Promise.all([
    pathPermalinks(
      db,
      entries.map((e) => e.originPathId),
    ),
    summarisePaths(
      db,
      [...new Set(credits.map((c) => c.pathId))].map((pathId) => ({
        pathId,
        title: null,
      })),
    ),
  ])
  const storyByPath = new Map(stories.map((s) => [s.pathId, s]))
  const titles = new Map(
    (credits.length
      ? await db
          .selectFrom('titles')
          .select(['path_id', 'title'])
          .where(
            'path_id',
            'in',
            credits.map((c) => c.pathId),
          )
          .execute()
      : []
    ).map((t) => [t.path_id, t.title]),
  )

  const recipients = new Map<number, { email: string; digest: Digest }>()
  const recipient = (userId: number, email: string) => {
    let entry = recipients.get(userId)
    if (!entry) {
      entry = {
        email,
        digest: {
          additions: new Map(),
          favourites: new Map(),
          titles: new Map(),
        },
      }
      recipients.set(userId, entry)
    }
    return entry.digest
  }
  for (const entry of entries) {
    push(recipient(entry.userId, entry.email).additions, entry.authorName, {
      content: entry.content,
      path: permalinks.get(entry.originPathId)?.permalink ?? '/',
    })
  }
  for (const credit of credits) {
    const story = storyByPath.get(credit.pathId)
    const digest = recipient(credit.userId, credit.email)
    push(
      credit.kind === 'like' ? digest.favourites : digest.titles,
      credit.actorName,
      {
        label:
          titles.get(credit.pathId) ?? story?.keySentences.at(-1) ?? 'A story',
        path: story?.permalink ?? '/',
      },
    )
  }

  await inTransaction(db, async (trx) => {
    for (const { email, digest } of recipients.values()) {
      await enqueue(trx, 'send-email', digestEmail(email, digest))
    }
    await trx
      .updateTable('users')
      .set({ last_notified_at: cutoff })
      .where('last_notified_at', '<', cutoff)
      .execute()
  })
  return recipients.size
}
