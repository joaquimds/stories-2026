// Seeds a small graph of stories.
//
// With --reset, drops the app schema first and creates three users.
// With --as <pen name>, deletes every fragment instead (keeping accounts)
// and writes the stories as that existing user.
import { sql } from 'kysely'
import { ROOT_THREAD } from '../src/domain/thread.ts'
import { hashPassword } from '../src/server/auth/passwords.ts'
import { createDb } from '../src/server/db/index.ts'
import { migrate } from '../src/server/db/migrate.ts'
import { setLike } from '../src/server/data/likes.ts'
import { linkSentence } from '../src/server/data/links.ts'
import { writeSentence } from '../src/server/data/sentences.ts'
import { setTitle } from '../src/server/data/titles.ts'
import type { Author } from '../src/server/data/sentences.ts'
import type { Db } from '../src/server/db/index.ts'

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error('DATABASE_URL is required')
}
const db = createDb(url, 1)

if (process.argv.includes('--reset')) {
  await sql`drop schema if exists app cascade`.execute(db)
  await sql`drop schema if exists pgboss cascade`.execute(db)
}
await migrate(db)

// The stories, written by three authors (or one author three times)
const writeStories = async (
  trx: Db,
  [ana, bob, cat]: [Author, Author, Author],
) => {
  const write = async (author: Author, story: string, content: string) =>
    (await writeSentence(trx, author, story, content)).thread

  const garden = await write(
    ana,
    ROOT_THREAD,
    'In the garden, the paths forked.',
  )
  const left = await write(
    bob,
    garden,
    'She took the left path, towards the river.',
  )
  const right = await write(
    cat,
    garden,
    'He took the right path, into the trees.',
  )
  const river = await write(
    ana,
    left,
    'The river was louder than she remembered.',
  )
  const bridge = await write(
    bob,
    river,
    'A bridge appeared where none had been.',
  )
  const trees = await write(cat, right, 'The trees leaned in to listen.')
  const clearing = await write(
    ana,
    trees,
    'At the clearing, he found her waiting.',
  )
  await write(
    bob,
    clearing,
    'Neither of them could say how they had got there.',
  )

  const letter = await write(
    bob,
    ROOT_THREAD,
    'The letter arrived a hundred years late.',
  )
  const opened = await write(
    cat,
    letter,
    'Nobody in the house could read the handwriting.',
  )
  await write(
    ana,
    opened,
    'Except the youngest, who had never learned to read.',
  )

  await write(
    cat,
    ROOT_THREAD,
    'Every night, the lighthouse blinked a different message.',
  )

  // Crossing over: the bridge leads to the clearing, the clearing loops
  // back to the garden...
  const crossing = await linkSentence(trx, ana, {
    story: bridge,
    sentenceId: Number(clearing.split('.')[0]),
  })
  await linkSentence(trx, cat, {
    story: clearing,
    sentenceId: Number(garden.split('.')[0]),
  })
  // ...and the garden leads straight to the clearing, so the two link each
  // other
  await linkSentence(trx, bob, {
    story: garden,
    sentenceId: Number(clearing.split('.')[0]),
  })

  await setTitle(trx, bob, { story: bridge, title: 'The Bridge' })
  await setTitle(trx, ana, { story: clearing, title: 'Waiting' })
  // Favourites only between different people
  if (new Set([ana.id, bob.id, cat.id]).size === 3) {
    await setLike(trx, cat, { story: bridge, liked: true })
    await setLike(trx, ana, { story: bridge, liked: true })
    await setLike(trx, bob, { story: crossing.thread, liked: true })
  }
}

const asIndex = process.argv.indexOf('--as')
if (asIndex !== -1) {
  const name = process.argv[asIndex + 1]
  const author = name
    ? await db
        .selectFrom('users')
        .select(['id', 'name'])
        .where('name', '=', name)
        .executeTakeFirst()
    : undefined
  if (!author) {
    throw new Error(`No user with the pen name ${JSON.stringify(name)}`)
  }
  await db.transaction().execute(async (trx) => {
    // Everything but the root; links, paths, favourites, titles and reports
    // go with the fragments
    const { numDeletedRows } = await trx
      .deleteFrom('sentences')
      .where('id', '<>', 0)
      .executeTakeFirst()
    console.info(`Deleted ${numDeletedRows} fragments`)
    await writeStories(trx, [author, author, author])
  })
  console.info(`Seeded the stories as ${author.name}`)
  await db.destroy()
  process.exit(0)
}

const existing = await db.selectFrom('users').select('id').executeTakeFirst()
if (existing) {
  console.info('Database already has users; run with --reset to start over')
  await db.destroy()
  process.exit(0)
}

// Every seeded account has the password "password"
const passwordHash = await hashPassword('password')
const createUser = (name: string) =>
  db
    .insertInto('users')
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      password_hash: passwordHash,
    })
    .returning(['id', 'name'])
    .executeTakeFirstOrThrow()
const ana = await createUser('Ana')
const bob = await createUser('Bob')
const cat = await createUser('Cat')

await db.transaction().execute((trx) => writeStories(trx, [ana, bob, cat]))

console.info('Seeded 3 users and their stories')
await db.destroy()
