import { afterAll } from 'vitest'
import { type Db, createDb } from '../../src/server/db/index.ts'
import type { Author } from '../../src/server/data/sentences.ts'
import { writeSentence } from '../../src/server/data/sentences.ts'

const testDb = createDb(process.env.DATABASE_URL as string, 2)

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
export const writeChain = async (
  trx: Db,
  author: Author,
  story: string | null,
  ...contents: string[]
) => {
  const threads: string[] = []
  let current = story
  for (const content of contents) {
    current = (await writeSentence(trx, author, current, content)).thread
    threads.push(current)
  }
  return threads
}

export const leafOf = (thread: string) => Number(thread.split('.')[0])
