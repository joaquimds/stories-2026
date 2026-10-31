import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { favourites, setLike } from '../../src/server/data/likes.ts'
import { linkSentence, myLinks } from '../../src/server/data/links.ts'
import { recentSentences } from '../../src/server/data/recent.ts'
import { digestEntries } from '../../src/server/data/rules.ts'
import { deleteSentence, myFragments } from '../../src/server/data/sentences.ts'
import { computeStats, countLoops } from '../../src/server/data/stats.ts'
import { library, setTitle } from '../../src/server/data/titles.ts'
import {
  authenticate,
  register,
  requestPasswordReset,
  resetPassword,
  updateSettings,
} from '../../src/server/data/users.ts'
import { hashToken } from '../../src/server/auth/tokens.ts'
import {
  createSession,
  resolveSession,
} from '../../src/server/auth/sessions.ts'
import { enforceLimit } from '../../src/server/auth/rate-limit.ts'
import { startBoss, stopBoss } from '../../src/server/jobs/boss.ts'
import { createUser, leafOf, rollback, writeChain } from './helpers.ts'

describe('library', () => {
  it(
    'lists titled stories by likes, age and title search',
    rollback(async (trx) => {
      const [ana, bob] = [await createUser(trx), await createUser(trx)]
      const [, b] = await writeChain(trx, ana, null, 'Once', 'upon')
      const [z] = await writeChain(trx, ana, null, 'Zed')
      await setTitle(trx, ana, { story: b!, title: 'Upon a time' })
      await setTitle(trx, ana, { story: z!, title: 'Zed’s dead' })
      await setLike(trx, bob, { story: z!, liked: true })

      const popular = await library(trx, { order: 'popular' })
      expect(popular.items.map((i) => i.title)).toEqual([
        'Zed’s dead',
        'Upon a time',
      ])
      expect(popular.items[1]).toMatchObject({
        permalink: '/s/Upon_a_time',
        keySentences: ['Once'],
      })
      const oldest = await library(trx, { order: 'oldest' })
      expect(oldest.items.map((i) => i.title)).toEqual([
        'Upon a time',
        'Zed’s dead',
      ])
      const search = await library(trx, { order: 'newest' }, 'upon')
      expect(search.items.map((i) => i.title)).toEqual(['Upon a time'])
    }),
  )
})

describe('account lists', () => {
  it(
    'lists favourites, fragments and links',
    rollback(async (trx) => {
      const [ana, bob] = [await createUser(trx), await createUser(trx)]
      const [a, b, c] = await writeChain(trx, ana, null, 'A', 'B', 'C')
      const [z] = await writeChain(trx, bob, null, 'Z')
      const { thread } = await linkSentence(trx, ana, {
        story: c!,
        sentenceId: leafOf(z!),
      })
      await setLike(trx, ana, { story: b!, liked: true })
      await setLike(trx, ana, { story: thread, liked: true })

      const favs = await favourites(trx, ana, { order: 'newest' })
      expect(favs.items.map((i) => i.keySentences)).toEqual([
        ['A', 'C', 'Z'],
        ['A', 'B'],
      ])

      const fragments = await myFragments(trx, ana, { order: 'oldest' })
      expect(fragments.items.map((f) => [f.content, f.permalink])).toEqual([
        ['A', `/s/${a}`],
        ['B', `/s/${b}`],
        ['C', `/s/${c}`],
      ])
      const searched = await myFragments(trx, ana, { order: 'oldest' }, 'b')
      expect(searched.items.map((f) => f.content)).toEqual(['B'])

      const links = await myLinks(trx, ana, { order: 'oldest' })
      expect(links.items).toEqual([
        expect.objectContaining({
          fromContent: 'C',
          toContent: 'Z',
          permalink: `/s/${thread}`,
        }),
      ])
      expect((await myLinks(trx, bob, { order: 'oldest' })).items).toEqual([])
    }),
  )
})

describe('recent', () => {
  it(
    'lists sentences site-wide, newest first, with what they follow',
    rollback(async (trx) => {
      const [ana, bob] = [
        await createUser(trx, 'Ana-r'),
        await createUser(trx, 'Bob-r'),
      ]
      const [, b] = await writeChain(trx, ana, null, 'A', 'B')
      const [c] = await writeChain(trx, bob, b!, 'C')
      await writeChain(trx, bob, null, 'Z')

      const recent = await recentSentences(trx, { order: 'newest' })
      expect(
        recent.items.map((i) => [i.content, i.previous, i.authorName]),
      ).toEqual([
        ['Z', null, 'Bob-r'],
        ['C', 'B', 'Bob-r'],
        ['B', 'A', 'Ana-r'],
        ['A', null, 'Ana-r'],
      ])
      expect(recent.items[1]?.permalink).toBe(`/s/${c}`)

      const loose = await recentSentences(
        trx,
        { order: 'oldest' },
        { looseEnds: true },
      )
      expect(loose.items.map((i) => i.content)).toEqual(['C', 'Z'])
    }),
  )
})

describe('digest recipients', () => {
  it(
    'finds new sentences by others under the user’s sentences',
    rollback(async (trx) => {
      const [ana, bob, cat] = [
        await createUser(trx, 'ana-digest'),
        await createUser(trx, 'bob-digest'),
        await createUser(trx, 'cat-digest'),
      ]
      const past = new Date(Date.now() - 60_000)
      await trx.updateTable('users').set({ last_notified_at: past }).execute()
      const [, b] = await writeChain(trx, ana, null, 'A', 'B')
      const [c] = await writeChain(trx, bob, b!, 'C')
      await writeChain(trx, ana, c!, 'D')
      await updateSettings(trx, cat.id, { isNotifiable: false })
      await writeChain(trx, cat, null, 'Elsewhere')
      const entries = await digestEntries(trx, new Date(Date.now() + 1000))
      expect(
        entries.map((e) => [
          e.email.split('@')[0],
          e.authorName,
          e.sentenceId,
          e.content,
        ]),
      ).toEqual([
        ['ana-digest', 'bob-digest', leafOf(c!), 'C'],
        ['bob-digest', 'ana-digest', leafOf(c!) + 1, 'D'],
      ])
    }),
  )
})

describe('stats', () => {
  it('counts independent loops', () => {
    expect(countLoops([])).toBe(0)
    expect(
      countLoops([
        [1, 2],
        [2, 3],
      ]),
    ).toBe(0)
    expect(countLoops([[1, 1]])).toBe(1)
    expect(
      countLoops([
        [1, 2],
        [2, 1],
        [2, 3],
        [3, 2],
      ]),
    ).toBe(2)
  })

  it(
    'computes totals and records',
    rollback(async (trx) => {
      const [ana, bob] = [await createUser(trx), await createUser(trx)]
      const [, b, c] = await writeChain(trx, ana, null, 'A', 'B', 'C')
      await writeChain(trx, bob, b!, 'C2')
      await linkSentence(trx, ana, { story: c!, sentenceId: leafOf(b!) })
      await setLike(trx, bob, { story: c!, liked: true })
      const [x] = await writeChain(trx, bob, null, 'X')
      await deleteSentence(trx, bob, x!)
      const stats = await computeStats(trx)
      expect(stats).toMatchObject({
        sentences: 4,
        writers: 2,
        likes: 1,
        titledStories: 0,
        sentencesLastWeek: 4,
        longestStory: { length: 4 },
        mostBranched: { content: 'B', children: 2 },
        mostLiked: { likes: 1, permalink: `/s/${c}` },
        loops: 1,
      })
    }),
  )
})

describe('users and sessions', () => {
  beforeAll(async () => {
    await startBoss(process.env.DATABASE_URL as string)
  })
  afterAll(async () => {
    await stopBoss()
  })

  it(
    'registers, authenticates and resolves sessions',
    rollback(async (trx) => {
      const input = {
        name: 'Writer',
        email: 'writer@example.com',
        password: 'correct horse',
        isNotifiable: true,
      }
      const id = await register(trx, input)
      await expect(
        register(trx, { ...input, email: 'other@example.com' }),
      ).rejects.toMatchObject({
        code: 'duplicate',
      })
      await expect(
        register(trx, { ...input, name: 'x', password: 'short' }),
      ).rejects.toMatchObject({
        code: 'invalid',
      })
      expect(
        await authenticate(trx, 'WRITER@example.com', 'correct horse'),
      ).toBe(id)
      await expect(
        authenticate(trx, input.email, 'wrong'),
      ).rejects.toMatchObject({
        code: 'credentials',
      })
      await expect(
        authenticate(trx, 'nobody@example.com', 'x'),
      ).rejects.toMatchObject({
        code: 'credentials',
      })

      const token = await createSession(trx, id)
      const session = await resolveSession(trx, token)
      expect(session?.user).toMatchObject({
        id,
        name: 'Writer',
        isNotifiable: true,
      })
      expect(await resolveSession(trx, 'nope')).toBeNull()
    }),
  )

  it(
    'resets passwords with single-use tokens and ends sessions',
    rollback(async (trx) => {
      const id = await register(trx, {
        name: 'Forgetful',
        email: 'forgetful@example.com',
        password: 'old password',
        isNotifiable: false,
      })
      const session = await createSession(trx, id)
      await requestPasswordReset(trx, 'forgetful@example.com')
      await requestPasswordReset(trx, 'unknown@example.com')
      const tokens = await trx
        .selectFrom('password_reset_tokens')
        .selectAll()
        .execute()
      expect(tokens).toHaveLength(1)

      // The emailed token is only known to the job; swap in a known one
      await trx
        .updateTable('password_reset_tokens')
        .set({ token_hash: hashToken('known-token') })
        .execute()
      await resetPassword(trx, 'known-token', 'new password')
      expect(
        await authenticate(trx, 'forgetful@example.com', 'new password'),
      ).toBe(id)
      expect(await resolveSession(trx, session)).toBeNull()
      await expect(
        resetPassword(trx, 'known-token', 'another one'),
      ).rejects.toMatchObject({
        code: 'notFound',
      })
    }),
  )

  it(
    'rate limits by key',
    rollback(async (trx) => {
      const limit = { max: 2, windowSeconds: 60 }
      await enforceLimit(trx, ['test:a'], limit)
      await enforceLimit(trx, ['test:a'], limit)
      await expect(enforceLimit(trx, ['test:a'], limit)).rejects.toMatchObject({
        code: 'rateLimited',
      })
      await enforceLimit(trx, ['test:b'], limit)
    }),
  )
})
