import { describe, expect, it } from 'vitest'
import { present } from '../../src/domain/present.ts'
import { setLike } from '../../src/server/data/likes.ts'
import { linkSentence } from '../../src/server/data/links.ts'
import { type MapGraph, getStoryMap } from '../../src/server/data/map.ts'
import { getChildren } from '../../src/server/data/stories.ts'
import { setTitle } from '../../src/server/data/titles.ts'
import {
  createUser,
  leafOf,
  resolved,
  rollback,
  writeChain,
} from './helpers.ts'

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
    'shows the whole story and one step on from where you are',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [, b, c, d] = await writeChain(trx, ana, null, 'A', 'B', 'C', 'D')
      // A branch off the story, not shown until you walk there
      await writeChain(trx, ana, b, 'C2')
      // Ahead of D: three continuations, one of them going further
      const [e] = await writeChain(trx, ana, d, 'E', 'F')
      await writeChain(trx, ana, d, 'E2')
      await writeChain(trx, ana, d, 'E3')

      const graph = await getStoryMap(trx, await resolved(trx, d))
      const { byContent, after } = view(graph)

      // The whole story, from the beginning
      expect(byContent('')).toMatchObject({ id: 0 })
      expect(after('')).toEqual(['A'])
      expect(after('A')).toEqual(['B'])
      expect(after('B')).toEqual(['C'])
      expect(byContent('C')?.origin).toBe(`/s/${c}`)
      expect(byContent('C2')).toBeUndefined()
      // One step ahead, as the story page lists it, and no further
      expect(after('D')).toEqual(['E', 'E2', 'E3'])
      expect(graph.steps[leafOf(e)]).toBe(`/s/${e}`)
      expect(byContent('D')).toMatchObject({ continuations: 3 })
      expect(byContent('F')).toBeUndefined()
      expect(byContent('E')).toMatchObject({ continuations: 1 })
      // Endings have no continuations at all
      expect(byContent('E2')).toMatchObject({ continuations: 0 })
      // What each was written after, for writing threads
      expect(byContent('C')?.defaultParent).toBe(leafOf(b))
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

      const graph = await getStoryMap(trx, await resolved(trx, a))
      // Liked by three people in all, Quiet by two, Old by one
      expect(view(graph).after('A')).toEqual(['Liked', 'Quiet', 'Old'])
      expect(view(graph).byContent('A')).toMatchObject({ continuations: 3 })
    }),
  )

  it(
    'takes its step forward from the story page, ranking and addresses alike',
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

      // A titled continuation keeps its title's address
      await setTitle(trx, ana, { story: here, title: 'Here' })

      const story = await resolved(trx, a)
      const page = await getChildren(trx, story, { order: 'popular' })
      const graph = await getStoryMap(trx, story)
      const onMap = view(graph).after('A')
      expect(onMap).toEqual(page.page.items.map((i) => i.content))
      expect(onMap).toEqual(['Popular here', 'Popular elsewhere', 'Unread'])
      expect(graph.steps).toEqual(
        Object.fromEntries(
          page.page.items.map((i) => [i.sentenceId, i.permalink]),
        ),
      )
      expect(graph.steps[leafOf(here)]).toBe('/s/Here')
    }),
  )

  it(
    'shows each sentence once, with loops as links back',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [a, , c] = await writeChain(trx, ana, null, 'A', 'B', 'C')
      await linkSentence(trx, ana, { story: c, sentenceId: leafOf(a) })
      const graph = await getStoryMap(trx, await resolved(trx, c))
      expect(graph.fragments.filter((f) => f.content === 'A')).toHaveLength(1)
      expect(view(graph).after('C')).toEqual(['A'])
      expect(graph.fragments[0]).toMatchObject({
        id: 0,
        content: '',
        origin: '/',
      })
    }),
  )
})

describe('what leads in', () => {
  it(
    'is not loaded: everything on the map can be walked to',
    rollback(async (trx) => {
      const ana = await createUser(trx)
      const [, , c] = await writeChain(trx, ana, null, 'A', 'B', 'C')
      const [z] = await writeChain(trx, ana, null, 'Z')
      await linkSentence(trx, ana, { story: z, sentenceId: leafOf(c) })
      const graph = await getStoryMap(trx, await resolved(trx, c))
      // Z also leads into C, but nothing on the story leads to Z
      expect(view(graph).before('C')).toEqual(['B'])
      expect(view(graph).byContent('Z')).toBeUndefined()
    }),
  )
})
