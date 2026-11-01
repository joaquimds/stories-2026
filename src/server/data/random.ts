import { sql } from 'kysely'
import { ROOT_ID } from '../../domain/thread.ts'
import type { Db } from '../db/index.ts'
import { encodeOneThread } from './paths.ts'
import { last } from '../../domain/present.ts'

// A safety net; the walk is already bounded by the number of links
const MAX_LENGTH = 200

// A story from the root, choosing a random continuation at each step. Loops
// are welcome, but each link is followed at most once, so the walk always
// ends: at a tale's end, or where every way on has been taken. Returns null
// when there are no beginnings.
export const randomStory = async (db: Db) => {
  const ids = [ROOT_ID]
  const taken = new Set<string>()
  while (ids.length < MAX_LENGTH) {
    const from = last(ids)
    const { rows } = await sql<{ id: number }>`
      select c.id from app.links l
      join app.sentences c on c.id = l.to_sentence_id
      where l.from_sentence_id = ${from} and c.deleted_at is null
    `.execute(db)
    const options = rows.filter((r) => !taken.has(`${from}-${r.id}`))
    const next = options[Math.floor(Math.random() * options.length)]
    if (!next) {
      break
    }
    taken.add(`${from}-${next.id}`)
    ids.push(next.id)
  }
  if (ids.length === 1) {
    return null
  }
  const thread = await encodeOneThread(db, ids)
  return thread
}
