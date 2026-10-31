import type { Db } from '../db/index.ts'
import { pathPermalinks } from '../data/paths.ts'
import { digestEntries } from '../data/rules.ts'
import { type DigestSentence, digestEmail } from '../email/templates.ts'
import { enqueue } from './boss.ts'

export const sendDigests = async (db: Db, cutoff = new Date()) => {
  const entries = await digestEntries(db, cutoff)
  const permalinks = await pathPermalinks(
    db,
    entries.map((e) => e.originPathId),
  )
  const recipients = new Map<
    number,
    { email: string; byAuthor: Map<string, DigestSentence[]> }
  >()
  for (const entry of entries) {
    const recipient = recipients.get(entry.userId) ?? {
      email: entry.email,
      byAuthor: new Map(),
    }
    const sentences = recipient.byAuthor.get(entry.authorName) ?? []
    sentences.push({
      content: entry.content,
      path: permalinks.get(entry.originPathId)?.permalink ?? '/',
    })
    recipient.byAuthor.set(entry.authorName, sentences)
    recipients.set(entry.userId, recipient)
  }
  await db.transaction().execute(async (trx) => {
    for (const { email, byAuthor } of recipients.values()) {
      await enqueue(trx, 'send-email', digestEmail(email, byAuthor))
    }
    await trx
      .updateTable('users')
      .set({ last_notified_at: cutoff })
      .where('last_notified_at', '<', cutoff)
      .execute()
  })
  return recipients.size
}
