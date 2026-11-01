import { ROOT_ID } from '../../domain/thread.ts'
import type { Db } from '../db/index.ts'
import { loadDefaultParents, pathPermalinks } from './paths.ts'
import { loadSentences } from './sentences.ts'
import { present } from '../../domain/present.ts'

export type StorySummary = {
  pathId: number
  title: string | null
  permalink: string
  // The first sentence, the sentence before each jump between branches,
  // and the last sentence
  keySentences: string[]
}

export const summarisePaths = async (
  db: Db,
  rows: { pathId: number; title: string | null }[],
  { firstOnly = false } = {},
): Promise<StorySummary[]> => {
  const permalinks = await pathPermalinks(
    db,
    rows.map((r) => r.pathId),
  )
  const allIds = [...permalinks.values()].flatMap((p) => p.sentenceIds)
  const [sentences, defaults] = await Promise.all([
    loadSentences(db, allIds),
    loadDefaultParents(db, allIds),
  ])
  return rows.map(({ pathId, title }) => {
    const path = permalinks.get(pathId)
    const ids = path?.sentenceIds ?? []
    const live = (id: number | undefined): id is number =>
      id !== undefined && id !== ROOT_ID && !sentences.get(id)?.deleted
    const key: number[] = []
    const first = ids.find(live)
    if (first !== undefined) {
      key.push(first)
    }
    if (!firstOnly) {
      for (let i = 1; i < ids.length; i++) {
        const before = ids[i - 1]
        if (defaults.get(present(ids[i])) !== before && live(before)) {
          key.push(before)
        }
      }
      const leaf = ids.at(-1)
      if (live(leaf)) {
        key.push(leaf)
      }
    }
    return {
      pathId,
      title,
      permalink: path?.permalink ?? '/',
      keySentences: key
        .filter((id, i) => id !== key[i - 1])
        .map((id) => sentences.get(id)?.content ?? ''),
    }
  })
}
