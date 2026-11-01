import { describe, expect, it } from 'vitest'
import { linkSentence } from '../../src/server/data/links.ts'
import {
  ensurePath,
  pathPermalinks,
  resolvePath,
  resolveStory,
} from '../../src/server/data/paths.ts'
import { setTitle } from '../../src/server/data/titles.ts'
import {
  createUser,
  leafOf,
  rollback,
  writeChain,
  resolved,
} from './helpers.ts'

describe('resolveStory', () => {
  it(
    'decodes threads along default parents',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [a, b, c] = await writeChain(trx, ana, null, 'A', 'B', 'C')
      const story = await resolved(trx, c)
      expect(story.sentenceIds).toEqual([0, ...[a, b, c].map((t) => leafOf(t))])
      expect(story.thread).toBe(c)
      // writing creates the origin paths of every sentence
      expect(story.pathIds.every((id) => id !== null)).toBe(true)
    }),
  )

  it(
    'decodes threads through links, including loops',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [a, b, c] = await writeChain(trx, ana, null, 'A', 'B', 'C')
      // C links back to B, making a loop
      const { thread: loop } = await linkSentence(trx, ana, {
        story: c,
        sentenceId: leafOf(b),
      })
      expect(loop).toBe(`${leafOf(b)}.${leafOf(b)}-${leafOf(c)}`)
      const { thread: again } = await linkSentence(trx, ana, {
        story: loop,
        sentenceId: leafOf(c),
      })
      const story = await resolved(trx, again)
      expect(story.sentenceIds).toEqual([
        0,
        ...[a, b, c, b, c].map((t) => leafOf(t)),
      ])
    }),
  )

  it(
    'rejects unknown sentences and steps without links',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [a, b] = await writeChain(trx, ana, null, 'A', 'B')
      expect(await resolveStory(trx, '999999')).toBeNull()
      expect(
        await resolveStory(trx, `${leafOf(a)}.${leafOf(a)}-${leafOf(b)}`),
      ).toBeNull()
      expect(await resolveStory(trx, 'no-such-title')).toBeNull()
    }),
  )

  it(
    'resolves slugs of titled stories',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [, b] = await writeChain(trx, ana, null, 'A', 'B')
      const { slug } = await setTitle(trx, ana, { story: b, title: 'A Tale' })
      expect(slug).toBe('A_Tale')
      const story = await resolved(trx, 'A_Tale')
      expect(story.thread).toBe(b)
    }),
  )
})

describe('ensurePath', () => {
  it(
    'creates missing ancestors once',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [a, b, c] = await writeChain(trx, ana, null, 'A', 'B', 'C')
      const ids = [0, ...[a, b, c].map((t) => leafOf(t))]
      const { pathId } = await resolvePath(trx, ids)
      expect(await ensurePath(trx, ids)).toBe(pathId)

      const beginning = leafOf((await writeChain(trx, ana, null, 'Z'))[0])
      // C → Z is not linked yet but paths can be ensured for any sequence
      const longer = [...ids, beginning]
      const created = await ensurePath(trx, longer)
      expect(await ensurePath(trx, longer)).toBe(created)
      const permalinks = await pathPermalinks(trx, [created])
      expect(permalinks.get(created)?.sentenceIds).toEqual(longer)
    }),
  )
})
