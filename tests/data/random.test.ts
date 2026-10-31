import { describe, expect, it } from 'vitest'
import { linkSentence } from '../../src/server/data/links.ts'
import { randomStory } from '../../src/server/data/random.ts'
import { resolveStory } from '../../src/server/data/paths.ts'
import { createUser, leafOf, rollback, writeChain } from './helpers.ts'

describe('randomStory', () => {
  it(
    'returns nothing when there are no stories',
    rollback(async (trx) => {
      expect(await randomStory(trx)).toBeNull()
    }),
  )

  it(
    'follows loops, taking each link at most once',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [a, b, c] = await writeChain(trx, ana, null, 'A', 'B', 'C')
      // C loops back to A, and nothing else follows C
      await linkSentence(trx, ana, { story: c!, sentenceId: leafOf(a!) })
      const story = await resolveStory(trx, (await randomStory(trx))!)
      // Round the loop back to A, whose way on has already been taken
      expect(story!.sentenceIds).toEqual([
        0,
        ...[a, b, c, a].map((t) => leafOf(t!)),
      ])
    }),
  )

  it(
    'ends at a tale’s end when there are no loops',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [a] = await writeChain(trx, ana, null, 'A')
      await writeChain(trx, ana, a!, 'B1', 'C1')
      await writeChain(trx, ana, a!, 'B2', 'C2', 'D2')
      for (let i = 0; i < 10; i++) {
        const story = await resolveStory(trx, (await randomStory(trx))!)
        const leaf = story!.sentenceIds.at(-1)!
        const children = await trx
          .selectFrom('links')
          .select('id')
          .where('from_sentence_id', '=', leaf)
          .execute()
        expect(children).toEqual([])
      }
    }),
  )
})
