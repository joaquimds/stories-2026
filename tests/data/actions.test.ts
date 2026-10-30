import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ActionError } from '../../src/domain/errors.ts'
import { setLike } from '../../src/server/data/likes.ts'
import { linkSentence, unlinkSentence } from '../../src/server/data/links.ts'
import { resolvePath, resolveStory } from '../../src/server/data/paths.ts'
import { reportSentence } from '../../src/server/data/reports.ts'
import {
  deleteSentence,
  editSentence,
  writeSentence,
} from '../../src/server/data/sentences.ts'
import { getChildren } from '../../src/server/data/stories.ts'
import { setTitle } from '../../src/server/data/titles.ts'
import { startBoss, stopBoss } from '../../src/server/jobs/boss.ts'
import { createUser, leafOf, rollback, writeChain } from './helpers.ts'

const rejectsWith = async (promise: Promise<unknown>, code: string) => {
  await expect(promise).rejects.toBeInstanceOf(ActionError)
  await expect(promise).rejects.toMatchObject({ code })
}

describe('write', () => {
  it(
    'continues a story with a system link and an origin path',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [a] = await writeChain(trx, ana, null, 'A')
      const { thread } = await writeSentence(trx, ana, a!, '  B  ')
      const sentence = await trx
        .selectFrom('sentences')
        .selectAll()
        .where('id', '=', leafOf(thread))
        .executeTakeFirstOrThrow()
      expect(sentence.content).toBe('B')
      const link = await trx
        .selectFrom('links')
        .selectAll()
        .where('to_sentence_id', '=', sentence.id)
        .executeTakeFirstOrThrow()
      expect(link).toMatchObject({
        from_sentence_id: leafOf(a!),
        author_id: null,
      })
      const { pathId } = await resolvePath(trx, [0, leafOf(a!), sentence.id])
      expect(pathId).not.toBeNull()
    }),
  )

  it(
    'rejects empty and overlong sentences',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      await rejectsWith(writeSentence(trx, ana, '0', '   '), 'invalid')
      await rejectsWith(
        writeSentence(trx, ana, '0', 'x'.repeat(281)),
        'invalid',
      )
    }),
  )
})

describe('link', () => {
  it(
    'links once and navigates to existing links',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [, b] = await writeChain(trx, ana, null, 'A', 'B')
      const [z] = await writeChain(trx, ana, null, 'Z')
      const first = await linkSentence(trx, ana, {
        story: b!,
        sentenceId: leafOf(z!),
      })
      const second = await linkSentence(trx, ana, {
        story: b!,
        sentenceId: leafOf(z!),
      })
      expect(second.thread).toBe(first.thread)
      expect(first.thread).toBe(`${leafOf(z!)}.${leafOf(z!)}-${leafOf(b!)}`)
      const links = await trx
        .selectFrom('links')
        .select('author_id')
        .where('from_sentence_id', '=', leafOf(b!))
        .where('to_sentence_id', '=', leafOf(z!))
        .execute()
      expect(links).toEqual([{ author_id: ana.id }])
      const story = await resolveStory(trx, first.thread)
      expect(story?.pathIds.at(-1)).not.toBeNull()
    }),
  )
})

describe('the root', () => {
  it(
    'can link an existing sentence as a new beginning',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [, b] = await writeChain(trx, ana, null, 'A', 'B')
      const { thread } = await linkSentence(trx, ana, {
        story: '0',
        sentenceId: leafOf(b!),
      })
      expect(thread).toBe(`${leafOf(b!)}.${leafOf(b!)}-0`)
      const beginnings = await getChildren(
        trx,
        (await resolveStory(trx, '0'))!,
        {
          order: 'oldest',
        },
      )
      expect(beginnings.page.items.map((i) => i.content)).toEqual(['A', 'B'])
      // ...which its linker can undo
      expect((await unlinkSentence(trx, ana, thread)).parentThread).toBe('0')
    }),
  )

  it(
    'cannot be edited, deleted, linked to, liked or reported',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [a] = await writeChain(trx, ana, null, 'A')
      await rejectsWith(
        editSentence(trx, ana, {
          story: a!,
          index: 0,
          content: 'x',
          branch: true,
        }),
        'invalid',
      )
      await rejectsWith(deleteSentence(trx, ana, '0'), 'forbidden')
      await rejectsWith(
        linkSentence(trx, ana, { story: a!, sentenceId: 0 }),
        'notFound',
      )
      await rejectsWith(
        setLike(trx, ana, { story: '0', liked: true }),
        'invalid',
      )
      await rejectsWith(
        setTitle(trx, ana, { story: '0', title: 'Home' }),
        'forbidden',
      )
      await rejectsWith(reportSentence(trx, ana.id, 0), 'notFound')
    }),
  )
})

describe('edit', () => {
  it(
    'edits in place while editable',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [, b] = await writeChain(trx, ana, null, 'A', 'B')
      const { thread } = await editSentence(trx, ana, {
        story: b!,
        index: 1,
        content: 'A!',
        branch: false,
      })
      expect(thread).toBe(b)
      const story = await resolveStory(trx, b!)
      const first = await trx
        .selectFrom('sentences')
        .select('content')
        .where('id', '=', story!.sentenceIds[1]!)
        .executeTakeFirstOrThrow()
      expect(first.content).toBe('A!')
    }),
  )

  it(
    'refuses in-place edits by others or once others have contributed',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const bob = await createUser(trx)
      const [a, b] = await writeChain(trx, ana, null, 'A', 'B')
      // Index 0 is the root
      const edit = { story: b!, index: 2, content: 'B!', branch: false }
      await rejectsWith(editSentence(trx, bob, edit), 'forbidden')
      await writeChain(trx, bob, a!, 'B2')
      await expect(editSentence(trx, ana, edit)).resolves.toBeTruthy()
      await rejectsWith(
        editSentence(trx, ana, { ...edit, index: 1 }),
        'forbidden',
      )
    }),
  )

  it(
    'branches with copies of outgoing links and keeps the rest of the story',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const bob = await createUser(trx)
      const [a, b, c, d] = await writeChain(trx, ana, null, 'A', 'B', 'C', 'D')
      const { thread } = await editSentence(trx, bob, {
        story: d!,
        index: 2,
        content: 'B, differently',
        branch: true,
      })
      const story = await resolveStory(trx, thread)
      const ids = story!.sentenceIds
      expect(ids).toHaveLength(5)
      expect(ids.slice(0, 2)).toEqual([0, leafOf(a!)])
      expect(ids[2]).not.toBe(leafOf(b!))
      expect(ids.slice(3)).toEqual([leafOf(c!), leafOf(d!)])

      const branch = await trx
        .selectFrom('sentences')
        .selectAll()
        .where('id', '=', ids[2]!)
        .executeTakeFirstOrThrow()
      expect(branch).toMatchObject({
        content: 'B, differently',
        author_id: bob.id,
      })
      const children = await getChildren(trx, (await resolveStory(trx, a!))!, {
        order: 'oldest',
      })
      expect(children.page.items.map((i) => i.content)).toEqual([
        'B',
        'B, differently',
      ])
    }),
  )
})

describe('delete', () => {
  it(
    'hard deletes sentences without children, with their likes and titles',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const bob = await createUser(trx)
      const [a, b] = await writeChain(trx, ana, null, 'A', 'B')
      await setLike(trx, bob, { story: b!, liked: true })
      await setTitle(trx, ana, { story: b!, title: 'Gone' })
      await rejectsWith(deleteSentence(trx, bob, b!), 'forbidden')
      const result = await deleteSentence(trx, ana, b!)
      expect(result).toEqual({ parentThread: a, deleted: true })
      expect(await resolveStory(trx, b!)).toBeNull()
      expect(await trx.selectFrom('likes').selectAll().execute()).toEqual([])
      expect(await trx.selectFrom('titles').selectAll().execute()).toEqual([])
    }),
  )

  it(
    'masks sentences with children and links past them',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const bob = await createUser(trx)
      const [a, b] = await writeChain(trx, ana, null, 'A', 'B')
      const [c] = await writeChain(trx, bob, b!, 'C')
      const result = await deleteSentence(trx, ana, b!)
      expect(result.deleted).toBe(false)
      const story = await resolveStory(trx, c!)
      expect(story?.sentenceIds).toEqual([
        0,
        ...[a, b, c].map((t) => leafOf(t!)),
      ])
      const skip = await trx
        .selectFrom('links')
        .selectAll()
        .where('from_sentence_id', '=', leafOf(a!))
        .where('to_sentence_id', '=', leafOf(c!))
        .executeTakeFirst()
      expect(skip?.author_id).toBeNull()
      await rejectsWith(deleteSentence(trx, ana, b!), 'notFound')
    }),
  )
})

describe('unlink', () => {
  it(
    'removes the link and the paths taking it',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [, b] = await writeChain(trx, ana, null, 'A', 'B')
      const [z] = await writeChain(trx, ana, null, 'Z')
      const { thread } = await linkSentence(trx, ana, {
        story: b!,
        sentenceId: leafOf(z!),
      })
      await setLike(trx, ana, { story: thread, liked: true })
      const result = await unlinkSentence(trx, ana, thread)
      expect(result.parentThread).toBe(b)
      expect(await resolveStory(trx, thread)).toBeNull()
      expect(await trx.selectFrom('likes').selectAll().execute()).toEqual([])
    }),
  )

  it(
    'refuses default steps, other authors and protected links',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const bob = await createUser(trx)
      const [, b] = await writeChain(trx, ana, null, 'A', 'B')
      const [z] = await writeChain(trx, ana, null, 'Z')
      await rejectsWith(unlinkSentence(trx, ana, b!), 'invalid')
      const { thread } = await linkSentence(trx, ana, {
        story: b!,
        sentenceId: leafOf(z!),
      })
      await rejectsWith(unlinkSentence(trx, bob, thread), 'forbidden')
      await writeChain(trx, bob, thread, 'More')
      await rejectsWith(unlinkSentence(trx, ana, thread), 'forbidden')
    }),
  )
})

describe('like', () => {
  it(
    'toggles likes, creating the path when needed',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const bob = await createUser(trx)
      const [a, b] = await writeChain(trx, ana, null, 'A', 'B')
      const [c] = await writeChain(trx, bob, b!, 'C')
      // Deleting B links A to C; nothing has used that path yet
      await deleteSentence(trx, ana, b!)
      const skipping = `${leafOf(c!)}.${leafOf(c!)}-${leafOf(a!)}`
      const ids = [0, leafOf(a!), leafOf(c!)]
      expect((await resolvePath(trx, ids)).pathId).toBeNull()

      const count = async () =>
        (await trx.selectFrom('likes').selectAll().execute()).length
      await setLike(trx, bob, { story: skipping, liked: true })
      expect((await resolvePath(trx, ids)).pathId).not.toBeNull()
      expect(await count()).toBe(1)
      await setLike(trx, bob, { story: skipping, liked: true })
      expect(await count()).toBe(1)
      await setLike(trx, bob, { story: skipping, liked: false })
      expect(await count()).toBe(0)
    }),
  )
})

describe('title', () => {
  it(
    'titles stories ending with the viewer’s sentence, with unique slugs',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const bob = await createUser(trx)
      const [a, b] = await writeChain(trx, ana, null, 'A', 'B')
      await rejectsWith(
        setTitle(trx, bob, { story: b!, title: 'Mine' }),
        'forbidden',
      )
      await rejectsWith(
        setTitle(trx, ana, { story: b!, title: '12.3-4' }),
        'invalid',
      )
      await setTitle(trx, ana, { story: b!, title: 'First title' })
      // Retitling replaces the title
      const { slug } = await setTitle(trx, ana, {
        story: b!,
        title: 'Second  title',
      })
      expect(slug).toBe('Second_title')
      expect(await trx.selectFrom('titles').select('title').execute()).toEqual([
        { title: 'Second  title'.trim() },
      ])
      await rejectsWith(
        setTitle(trx, ana, { story: a!, title: 'Second title' }),
        'duplicate',
      )
    }),
  )
})

describe('report', () => {
  beforeAll(async () => {
    await startBoss(process.env.DATABASE_URL as string)
  })
  afterAll(async () => {
    await stopBoss()
  })

  it(
    'stores the report and queues the admin email',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [a] = await writeChain(trx, ana, null, 'A')
      await reportSentence(trx, null, leafOf(a!))
      const reports = await trx.selectFrom('reports').selectAll().execute()
      expect(reports).toHaveLength(1)
      const { rows } = await sql<{ count: number }>`
        select count(*)::int as count from pgboss.job where name = 'report-email'
      `.execute(trx)
      expect(rows[0]?.count).toBe(1)
      await rejectsWith(reportSentence(trx, null, 999999), 'notFound')
    }),
  )
})
