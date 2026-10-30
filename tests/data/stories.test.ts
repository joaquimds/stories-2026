import { describe, expect, it } from 'vitest'
import type { PageParams } from '../../src/domain/pagination.ts'
import type { Db } from '../../src/server/db/index.ts'
import { setLike } from '../../src/server/data/likes.ts'
import { linkSentence } from '../../src/server/data/links.ts'
import { resolveStory } from '../../src/server/data/paths.ts'
import { deleteSentence } from '../../src/server/data/sentences.ts'
import {
  getChildren,
  getLinkCandidates,
  getStory,
} from '../../src/server/data/stories.ts'
import { createUser, leafOf, rollback, writeChain } from './helpers.ts'

const children = async (trx: Db, thread: string | null, params: PageParams) => {
  const story = await resolveStory(trx, thread ?? '0')
  return getChildren(trx, story!, params)
}

const contents = (page: { items: { content: string }[] }) =>
  page.items.map((i) => i.content)

describe('getChildren', () => {
  it(
    'orders by contributors here, then anywhere, then age',
    rollback(async (trx) => {
      const [ana, bob, cat, carl, dave, zed, eve] = await Promise.all(
        ['ana', 'bob', 'cat', 'carl', 'dave', 'zed', 'eve'].map((n) =>
          createUser(trx, n),
        ),
      )
      const [a] = await writeChain(trx, ana!, null, 'A')
      await writeChain(trx, ana!, a!, 'B1')
      const [b2] = await writeChain(trx, bob!, a!, 'B2')
      const [b3] = await writeChain(trx, cat!, a!, 'B3')
      const [c] = await writeChain(trx, carl!, b2!, 'C')
      await setLike(trx, dave!, { story: c!, liked: true })
      // B3 is popular elsewhere: linked after Z and liked there
      const [z] = await writeChain(trx, zed!, null, 'Z')
      const { thread: zb3 } = await linkSentence(trx, zed!, {
        story: z!,
        sentenceId: leafOf(b3!),
      })
      await setLike(trx, eve!, { story: zb3, liked: true })

      const popular = await children(trx, a!, { order: 'popular' })
      expect(contents(popular.page)).toEqual(['B2', 'B3', 'B1'])
      expect(popular.count).toBe(3)

      const newest = await children(trx, a!, { order: 'newest' })
      expect(contents(newest.page)).toEqual(['B3', 'B2', 'B1'])
      const oldest = await children(trx, a!, { order: 'oldest' })
      expect(contents(oldest.page)).toEqual(['B1', 'B2', 'B3'])
      expect(oldest.page.items[1]?.permalink).toBe(`/s/${b2}`)
    }),
  )

  it(
    'pages with keysets and popular page numbers',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [a] = await writeChain(trx, ana, null, 'A')
      const names = Array.from({ length: 12 }, (_, i) => `child ${i + 1}`)
      for (const name of names) {
        await writeChain(trx, ana, a!, name)
      }

      const first = await children(trx, a!, { order: 'oldest' })
      expect(contents(first.page)).toEqual(names.slice(0, 10))
      expect(first.page.prev).toBeNull()
      expect(first.page.next).toMatchObject({ order: 'oldest' })

      const second = await children(trx, a!, first.page.next!)
      expect(contents(second.page)).toEqual(names.slice(10))
      expect(second.page.next).toBeNull()

      const back = await children(trx, a!, second.page.prev!)
      expect(contents(back.page)).toEqual(names.slice(0, 10))
      expect(back.page.prev).toBeNull()

      const newest = await children(trx, a!, { order: 'newest' })
      const older = await children(trx, a!, newest.page.next!)
      expect(contents(older.page)).toEqual(['child 2', 'child 1'])

      const popular = await children(trx, a!, { order: 'popular' })
      expect(popular.page.next).toEqual({ order: 'popular', page: 2 })
      const popular2 = await children(trx, a!, popular.page.next!)
      expect(popular2.page.items).toHaveLength(2)
      expect(popular2.page.prev).toEqual({ order: 'popular', page: 1 })
    }),
  )

  it(
    'makes the children of a deleted beginning into beginnings',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const bob = await createUser(trx)
      const [x] = await writeChain(trx, ana, null, 'X')
      const [y] = await writeChain(trx, bob, x!, 'Y')
      await writeChain(trx, bob, null, 'W')
      await deleteSentence(trx, ana, x!)

      const root = await children(trx, null, { order: 'oldest' })
      // Y was written before W
      expect(contents(root.page)).toEqual(['Y', 'W'])
      const yItem = root.page.items.find((i) => i.content === 'Y')
      // Reached directly from the root, skipping X
      expect(yItem?.permalink).toBe(`/s/${leafOf(y!)}.${leafOf(y!)}-0`)
    }),
  )

  it(
    'excludes deleted children and shows their children instead',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const bob = await createUser(trx)
      const [a, b] = await writeChain(trx, ana, null, 'A', 'B')
      await writeChain(trx, bob, b!, 'C')
      await deleteSentence(trx, ana, b!)
      const result = await children(trx, a!, { order: 'oldest' })
      expect(contents(result.page)).toEqual(['C'])
    }),
  )
})

describe('getStory', () => {
  it(
    'reports authorship, likes and per-sentence editability',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const bob = await createUser(trx)
      const [a, b] = await writeChain(trx, ana, null, 'A', 'B')
      let story = await getStory(trx, ana, (await resolveStory(trx, b!))!)
      expect(story.lines.map((l) => [l.content, l.editable])).toEqual([
        ['A', true],
        ['B', true],
      ])
      expect(story.isLeafAuthor).toBe(true)
      expect(story.liked).toBe(false)

      // Bob continuing from A makes A part of his story, but not B
      await writeChain(trx, bob, a!, 'B2')
      story = await getStory(trx, ana, (await resolveStory(trx, b!))!)
      expect(story.lines.map((l) => l.editable)).toEqual([false, true])

      await setLike(trx, ana, { story: b!, liked: true })
      story = await getStory(trx, ana, (await resolveStory(trx, b!))!)
      expect(story.liked).toBe(true)
      expect(story.lines[1]?.editable).toBe(true)

      await setLike(trx, bob, { story: b!, liked: true })
      story = await getStory(trx, ana, (await resolveStory(trx, b!))!)
      expect(story.lines[1]?.editable).toBe(false)

      const asBob = await getStory(trx, bob, (await resolveStory(trx, b!))!)
      expect(asBob.isLeafAuthor).toBe(false)
      expect(asBob.lines.map((l) => l.editable)).toEqual([false, false])
    }),
  )

  it(
    'only lets the link author unlink while nobody else has built on it',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const bob = await createUser(trx)
      const cat = await createUser(trx)
      const [, b] = await writeChain(trx, ana, null, 'A', 'B')
      const [z] = await writeChain(trx, bob, null, 'Z')
      const { thread } = await linkSentence(trx, ana, {
        story: b!,
        sentenceId: leafOf(z!),
      })
      const view = async (viewer = ana) =>
        getStory(trx, viewer, (await resolveStory(trx, thread))!)

      expect((await view()).canUnlink).toBe(true)
      expect((await view(bob)).canUnlink).toBe(false)

      await setLike(trx, ana, { story: thread, liked: true })
      expect((await view()).canUnlink).toBe(true)

      await setLike(trx, cat, { story: thread, liked: true })
      expect((await view()).canUnlink).toBe(false)
    }),
  )
})

describe('getLinkCandidates', () => {
  it(
    'finds siblings, relatives and search matches',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [a, b1] = await writeChain(trx, ana, null, 'A', 'B1')
      const [b2] = await writeChain(trx, ana, a!, 'B2')
      const [c] = await writeChain(trx, ana, b2!, 'C')
      const [z] = await writeChain(trx, ana, null, 'Zebra')
      const ids = (page: { items: { id: number }[] }) =>
        page.items.map((i) => i.id)

      const siblings = await getLinkCandidates(trx, {
        from: leafOf(b1!),
        direction: 'siblings',
      })
      expect(ids(siblings)).toEqual([leafOf(b1!), leafOf(b2!)])
      expect(siblings.items[0]).toMatchObject({
        hasParent: true,
        hasChild: false,
      })
      expect(siblings.items[1]).toMatchObject({ hasChild: true })

      const parents = await getLinkCandidates(trx, {
        from: leafOf(c!),
        direction: 'parents',
      })
      expect(ids(parents)).toEqual([leafOf(b1!), leafOf(b2!)])

      const parentsOfB = await getLinkCandidates(trx, {
        from: leafOf(b1!),
        direction: 'parents',
      })
      // A's parent is the virtual root, so its siblings are all beginnings
      expect(ids(parentsOfB)).toEqual([leafOf(a!), leafOf(z!)])

      const beginnings = await getLinkCandidates(trx, {
        from: leafOf(a!),
        direction: 'siblings',
      })
      expect(ids(beginnings)).toEqual([leafOf(a!), leafOf(z!)])

      const ahead = await getLinkCandidates(trx, {
        from: leafOf(a!),
        direction: 'children',
      })
      expect(ids(ahead)).toEqual([leafOf(b1!), leafOf(b2!)])

      const search = await getLinkCandidates(trx, {
        from: leafOf(a!),
        direction: 'siblings',
        search: 'zEb',
      })
      expect(ids(search)).toEqual([leafOf(z!)])
    }),
  )
})
