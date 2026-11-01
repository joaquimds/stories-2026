import { describe, expect, it } from 'vitest'
import { present } from '../../src/domain/present.ts'
import { setLike } from '../../src/server/data/likes.ts'
import { linkSentence } from '../../src/server/data/links.ts'
import { getStoryMap } from '../../src/server/data/map.ts'
import { getChildren } from '../../src/server/data/stories.ts'
import {
  createUser,
  leafOf,
  rollback,
  writeChain,
  resolved,
} from './helpers.ts'

const limits = { trunk: 3, ahead: 2, aside: 1, children: 2, nodes: 50 }

describe('getStoryMap', () => {
  it(
    'shows the end of the story, its branches, and what lies ahead',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [, b, c, d] = await writeChain(trx, ana, null, 'A', 'B', 'C', 'D')
      // A branch off the story, which itself continues
      await writeChain(trx, ana, b, 'C2', 'C2-next')
      // Ahead of D: three continuations, one three levels deep
      await writeChain(trx, ana, d, 'E', 'F', 'G')
      await writeChain(trx, ana, d, 'E2')
      await writeChain(trx, ana, d, 'E3')

      const story = await resolved(trx, d)
      const nodes = await getStoryMap(trx, story, limits)
      const byContent = (content: string) =>
        nodes.find((n) => n.content === content)

      // The trunk is the last three sentences: B, C, D
      expect(nodes[0]).toMatchObject({ content: 'B', depth: 0, onStory: true })
      expect(byContent('A')).toBeUndefined()
      expect(byContent('C')?.permalink).toBe(`/s/${c}`)
      expect(byContent('D')).toMatchObject({ onStory: true, current: true })
      // The branch off the story shows one level
      expect(byContent('C2')).toMatchObject({ onStory: false, more: 1 })
      expect(byContent('C2-next')).toBeUndefined()
      // Ahead: two of the three continuations, then one more level
      const ahead = nodes.filter((n) => n.parent === byContent('D')?.key)
      expect(ahead.map((n) => n.content)).toEqual(['E', 'E2'])
      expect(byContent('D')?.more).toBe(1)
      expect(byContent('F')).toMatchObject({ depth: 4, more: 1 })
      expect(byContent('G')).toBeUndefined()
    }),
  )

  it(
    'shows the most popular continuations first',
    rollback(async (trx) => {
      const [ana, bob, cat] = [
        await createUser(trx),
        await createUser(trx),
        await createUser(trx),
      ]
      const [a] = await writeChain(trx, ana, null, 'A')
      await writeChain(trx, ana, a, 'Old')
      const [quiet] = await writeChain(trx, ana, a, 'Quiet')
      const [liked] = await writeChain(trx, ana, a, 'Liked')
      await setLike(trx, bob, { story: liked, liked: true })
      await setLike(trx, cat, { story: liked, liked: true })
      await writeChain(trx, bob, quiet, 'Continued')

      const story = await resolved(trx, a)
      const nodes = await getStoryMap(trx, story, limits)
      const first = present(nodes.find((n) => n.content === 'A'))
      const children = nodes.filter((n) => n.parent === first.key)
      // Liked by three people in all, Quiet by two, Old by one; two shown
      expect(children.map((n) => n.content)).toEqual(['Liked', 'Quiet'])
      expect(first.more).toBe(1)
    }),
  )

  it(
    'ranks continuations exactly as the story page does',
    rollback(async (trx) => {
      const [ana, bob, cat, dan] = [
        await createUser(trx),
        await createUser(trx),
        await createUser(trx),
        await createUser(trx),
      ]
      const [a] = await writeChain(trx, ana, null, 'A')
      const [here] = await writeChain(trx, ana, a, 'Popular here')
      const [elsewhere] = await writeChain(trx, ana, a, 'Popular elsewhere')
      await writeChain(trx, ana, a, 'Unread')
      // One like on this route...
      await setLike(trx, bob, { story: here, liked: true })
      // ...against two likes on another route through the other sentence
      const [z] = await writeChain(trx, cat, null, 'Z')
      const { thread } = await linkSentence(trx, cat, {
        story: z,
        sentenceId: leafOf(elsewhere),
      })
      await setLike(trx, cat, { story: thread, liked: true })
      await setLike(trx, dan, { story: thread, liked: true })

      const story = await resolved(trx, a)
      const page = await getChildren(trx, story, { order: 'popular' })
      const nodes = await getStoryMap(trx, story, { ...limits, children: 8 })
      const first = present(nodes.find((n) => n.content === 'A'))
      const onMap = nodes
        .filter((n) => n.parent === first.key)
        .map((n) => n.content)
      expect(onMap).toEqual(page.page.items.map((i) => i.content))
      expect(onMap).toEqual(['Popular here', 'Popular elsewhere', 'Unread'])
    }),
  )

  it(
    'marks loops instead of following them',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [a, , c] = await writeChain(trx, ana, null, 'A', 'B', 'C')
      await linkSentence(trx, ana, { story: c, sentenceId: leafOf(a) })
      const story = await resolved(trx, c)
      const nodes = await getStoryMap(trx, story, { ...limits, trunk: 4 })
      const loop = nodes.find((n) => n.loop)
      expect(loop).toMatchObject({ content: 'A', depth: 4, more: 1 })
      // The root is shown when the story is short enough
      expect(nodes[0]).toMatchObject({ sentenceId: 0, permalink: '/' })
    }),
  )
})
