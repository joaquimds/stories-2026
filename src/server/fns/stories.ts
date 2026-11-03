import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { toPageParams } from '../../domain/pagination.ts'
import { storySearchSchema } from '../../domain/search.ts'
import { LIMITS, enforceLimit } from '../auth/rate-limit.ts'
import { clientIp, currentUser } from '../auth/request.ts'
import { db } from '../db/index.ts'
import { setLike } from '../data/likes.ts'
import { linkSentence, unlinkSentence } from '../data/links.ts'
import { resolveStory } from '../data/paths.ts'
import { getStoryMap } from '../data/map.ts'
import { randomStory } from '../data/random.ts'
import { reportSentence } from '../data/reports.ts'
import {
  MAX_CONTENT_LENGTH,
  deleteSentence,
  editSentence,
  writeSentence,
} from '../data/sentences.ts'
import { getChildren, getLinkCandidates, getStory } from '../data/stories.ts'
import { setTitle } from '../data/titles.ts'
import { MAX_TITLE_LENGTH } from '../../domain/slug.ts'
import { runAction, runUserAction } from './action.ts'
import { last } from '../../domain/present.ts'

const story = z.string().min(1).max(4000)
const id = z.number().int().positive()
const content = z.string().trim().min(1).max(MAX_CONTENT_LENGTH)

const viewerOf = (user: { id: number; name: string }) => ({
  id: user.id,
  name: user.name,
})

export const getStoryPage = createServerFn({ method: 'GET' })
  .validator(z.object({ story, search: storySearchSchema }))
  .handler(async ({ data }) => {
    const database = db()
    // Who is reading, alongside which story, rather than one after the other
    const [user, resolved] = await Promise.all([
      currentUser(),
      resolveStory(database, data.story),
    ])
    if (!resolved) {
      throw notFound()
    }
    const viewer = user ? viewerOf(user) : null
    const { search } = data
    const leaf = last(resolved.sentenceIds)
    const [view, children, link] = await Promise.all([
      getStory(database, viewer, resolved),
      getChildren(database, resolved, toPageParams(search, 'popular')),
      viewer && search.tab === 'link'
        ? getLinkCandidates(database, {
            from: search['l.from'] ?? leaf,
            direction: search['l.dir'] ?? 'siblings',
            search: search['l.q'],
            after: search['l.after'],
            before: search['l.before'],
          })
        : null,
    ])
    return { story: view, children, link }
  })

export const write = createServerFn({ method: 'POST' })
  .validator(z.object({ story, content }))
  .handler(({ data }) =>
    runUserAction((trx, viewer) =>
      writeSentence(trx, viewer, data.story, data.content),
    ),
  )

export const link = createServerFn({ method: 'POST' })
  .validator(z.object({ story, sentenceId: id }))
  .handler(({ data }) =>
    runUserAction((trx, viewer) => linkSentence(trx, viewer, data)),
  )

export const edit = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      story,
      index: z.number().int().min(0),
      content,
      branch: z.boolean(),
    }),
  )
  .handler(({ data }) =>
    runUserAction((trx, viewer) => editSentence(trx, viewer, data)),
  )

export const remove = createServerFn({ method: 'POST' })
  .validator(z.object({ story }))
  .handler(({ data }) =>
    runUserAction((trx, viewer) => deleteSentence(trx, viewer, data.story)),
  )

export const unlink = createServerFn({ method: 'POST' })
  .validator(z.object({ story }))
  .handler(({ data }) =>
    runUserAction((trx, viewer) => unlinkSentence(trx, viewer, data.story)),
  )

export const like = createServerFn({ method: 'POST' })
  .validator(z.object({ story, liked: z.boolean() }))
  .handler(({ data }) =>
    runUserAction((trx, viewer) => setLike(trx, viewer, data)),
  )

export const title = createServerFn({ method: 'POST' })
  .validator(z.object({ story, title: z.string().max(MAX_TITLE_LENGTH * 2) }))
  .handler(({ data }) =>
    runUserAction((trx, viewer) => setTitle(trx, viewer, data)),
  )

export const report = createServerFn({ method: 'POST' })
  .validator(z.object({ sentenceId: id }))
  .handler(async ({ data }) => {
    const user = await currentUser()
    return runAction(async (trx) => {
      // Counted in the transaction: a failed report doesn't use up the limit
      await enforceLimit(trx, [`report:ip:${clientIp()}`], LIMITS.report)
      return reportSentence(trx, user?.id ?? null, data.sentenceId)
    })
  })

export const getRandomStory = createServerFn({ method: 'GET' }).handler(() =>
  randomStory(db()),
)

// The graph around a story, for the map, built from the story page's own
// data: the story and the address of each point on it (getStory), the
// step forward (getChildren), and what leads into where you are
export const getMap = createServerFn({ method: 'GET' })
  .validator(z.object({ story }))
  .handler(async ({ data }) => {
    const database = db()
    const resolved = await resolveStory(database, data.story)
    if (!resolved) {
      throw notFound()
    }
    const [graph, view] = await Promise.all([
      getStoryMap(database, resolved),
      getStory(database, null, resolved),
    ])
    // The story up to each of its sentences; the root's is the home page
    const prefixes = resolved.sentenceIds.map(() => '/')
    for (const line of view.lines) {
      prefixes[line.index] = line.permalink
    }
    return {
      graph,
      path: resolved.sentenceIds,
      prefixes,
      // What each of the story's sentences was written after, for writing
      // the addresses of walks onwards from it
      pathDefaults: Object.fromEntries(resolved.defaults),
      permalink: view.permalink,
      title: view.title,
    }
  })
