import { describe, expect, it } from 'vitest'
import { present } from '../../src/domain/present.ts'
import { setLike } from '../../src/server/data/likes.ts'
import { linkSentence } from '../../src/server/data/links.ts'
import {
  type MapGraph,
  extensionPermalinks,
  getStoryMap,
} from '../../src/server/data/map.ts'
import { getChildren } from '../../src/server/data/stories.ts'
import {
  createUser,
  leafOf,
  resolved,
  rollback,
  writeChain,
} from './helpers.ts'

const limits = {
  trunk: 3,
  ahead: 2,
  aside: 1,
  children: 2,
  parents: 8,
  fragments: 50,
}

// Lookups by content, for readable tests
const view = (graph: MapGraph) => {
  const byContent = (content: string) =>
    graph.fragments.find((f) => f.content === content)
  const id = (content: string) => present(byContent(content)).id
  const contentOf = (fragmentId: number) =>
    graph.fragments.find((f) => f.id === fragmentId)?.content
  const after = (content: string) =>
    graph.links
      .filter((l) => l.from === id(content))
      .map((l) => contentOf(l.to))
  const before = (content: string) =>
    graph.links
      .filter((l) => l.to === id(content))
      .map((l) => contentOf(l.from))
  return { byContent, after, before }
}

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

      const graph = await getStoryMap(trx, await resolved(trx, d), limits)
      const { byContent, after } = view(graph)

      // The trunk is the last three sentences: B, C, D
      expect(byContent('A')).toBeUndefined()
      expect(after('B')).toEqual(['C', 'C2'])
      expect(byContent('C')?.origin).toBe(`/s/${c}`)
      // The branch off the story shows one level
      expect(byContent('C2')).toMatchObject({ continuations: 1 })
      expect(byContent('C2-next')).toBeUndefined()
      // Ahead: two of the three continuations, then one more level
      expect(after('D')).toEqual(['E', 'E2'])
      expect(byContent('D')).toMatchObject({ continuations: 3 })
      expect(after('E')).toEqual(['F'])
      expect(byContent('F')).toMatchObject({ continuations: 1 })
      expect(byContent('G')).toBeUndefined()
      // Endings have no continuations at all
      expect(byContent('E2')).toMatchObject({ continuations: 0 })
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

      const graph = await getStoryMap(trx, await resolved(trx, a), limits)
      // Liked by three people in all, Quiet by two, Old by one; two shown
      expect(view(graph).after('A')).toEqual(['Liked', 'Quiet'])
      expect(view(graph).byContent('A')).toMatchObject({ continuations: 3 })
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
      const graph = await getStoryMap(trx, story, { ...limits, children: 8 })
      const onMap = view(graph).after('A')
      expect(onMap).toEqual(page.page.items.map((i) => i.content))
      expect(onMap).toEqual(['Popular here', 'Popular elsewhere', 'Unread'])
    }),
  )

  it(
    'shows each sentence once, with loops as links back',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [a, , c] = await writeChain(trx, ana, null, 'A', 'B', 'C')
      await linkSentence(trx, ana, { story: c, sentenceId: leafOf(a) })
      const graph = await getStoryMap(trx, await resolved(trx, c), {
        ...limits,
        trunk: 4,
      })
      expect(graph.fragments.filter((f) => f.content === 'A')).toHaveLength(1)
      expect(view(graph).after('C')).toEqual(['A'])
      // The root is on the map when the story is short enough
      expect(graph.fragments[0]).toMatchObject({
        id: 0,
        content: '',
        origin: '/',
      })
    }),
  )

  it(
    'follows the story on to each continuation of its last sentence',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [a] = await writeChain(trx, ana, null, 'A')
      const [b] = await writeChain(trx, ana, a, 'B')
      const story = await resolved(trx, a)
      const graph = await getStoryMap(trx, story, limits)
      expect(await extensionPermalinks(trx, story, graph)).toEqual({
        [leafOf(b)]: `/s/${b}`,
      })
    }),
  )
})

describe('what leads in', () => {
  it(
    'loads everything that leads into the current sentence, one level back',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [, , c] = await writeChain(trx, ana, null, 'A', 'B', 'C')
      const [z] = await writeChain(trx, ana, null, 'Z')
      await linkSentence(trx, ana, { story: z, sentenceId: leafOf(c) })
      const graph = await getStoryMap(trx, await resolved(trx, c), {
        ...limits,
        trunk: 2,
      })
      const { before, byContent } = view(graph)
      // C is reached from B, and also linked from Z, the story's own
      // previous sentence first
      expect(before('C')).toEqual(['B', 'Z'])
      // One level only: nothing leading into Z
      expect(before('Z')).toEqual([])
      expect(byContent('A')).toBeUndefined()
    }),
  )
})
