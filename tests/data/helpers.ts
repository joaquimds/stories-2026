import { afterAll } from 'vitest'
import { present } from '../../src/domain/present.ts'
import { ROOT_THREAD } from '../../src/domain/thread.ts'
import { type Db, createDb } from '../../src/server/db/index.ts'
import type { Author } from '../../src/server/data/sentences.ts'
import { writeSentence } from '../../src/server/data/sentences.ts'
import { resolveStory } from '../../src/server/data/paths.ts'

const testDb = createDb(present(process.env.DATABASE_URL), 2)

afterAll(async () => {
  await testDb.destroy()
})

class Rollback extends Error {}

// Runs a test body in a transaction that is always rolled back
export const rollback = (fn: (trx: Db) => Promise<void>) => async () => {
  try {
    await testDb.transaction().execute(async (trx) => {
      await fn(trx)
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) {
      throw error
    }
  }
}

let userCount = 0

export const createUser = async (
  trx: Db,
  name = `user${++userCount}`,
): Promise<Author> => {
  const { id } = await trx
    .insertInto('users')
    .values({ name, email: `${name}@example.com`, password_hash: 'x' })
    .returning('id')
    .executeTakeFirstOrThrow()
  return { id, name }
}

// Writes a chain of sentences, returning the thread after each one
// The thread after each fragment, one per content given
export const writeChain = async <const C extends string[]>(
  trx: Db,
  author: Author,
  story: string | null,
  ...contents: C
): Promise<{ [K in keyof C]: string }> => {
  const threads: string[] = []
  let current = story ?? ROOT_THREAD
  for (const content of contents) {
    current = (await writeSentence(trx, author, current, content)).thread
    threads.push(current)
  }
  // One per content, which TypeScript can't follow through the loop
  return threads as { [K in keyof C]: string }
}

// The story at a thread, which the test expects to exist
export const resolved = async (trx: Db, thread: string) =>
  present(await resolveStory(trx, thread))

export const leafOf = (thread: string) => Number(thread.split('.')[0])
