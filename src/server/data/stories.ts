import { type RawBuilder, sql } from 'kysely'
import {
  PAGE_SIZE,
  type Page,
  type PageParams,
} from '../../domain/pagination.ts'
import type { LinkDirection } from '../../domain/search.ts'
import { ROOT_ID } from '../../domain/thread.ts'
import type { Db } from '../db/index.ts'
import {
  keysetPage,
  keysetQuery,
  popularOffset,
  popularPage,
  searchPattern,
} from './paging.ts'
import {
  type DefaultParents,
  type ResolvedStory,
  loadDefaultParents,
  permalink,
  threadOf,
} from './paths.ts'
import {
  editableSentences,
  isStepProtected,
  popularOrder,
  popularityScores,
} from './rules.ts'
import { type SentenceRow, loadSentences } from './sentences.ts'
import { last, present } from '../../domain/present.ts'

export type Viewer = { id: number; name: string } | null

export type StoryLine = SentenceRow & {
  // Position in the story's sentence ids, which start with the root
  index: number
  // Permalink of the story up to and including this sentence
  permalink: string
  editable: boolean
  // Other ways the story could go at this point, if any
  fork: Fork | null
}

export type Fork = {
  count: number
  // The first few alternatives, each opening that version of the story
  options: { id: number; content: string; permalink: string }[]
  // The story up to the previous sentence, where all of them are listed
  allPermalink: string
}

const FORK_OPTIONS = 5

export type Story = {
  thread: string
  // The home page: the root alone, which is never shown as a line
  isRoot: boolean
  permalink: string
  title: string | null
  lines: StoryLine[]
  liked: boolean
  canUnlink: boolean
  isLeafAuthor: boolean
}

export const getStory = async (
  db: Db,
  viewer: Viewer,
  resolved: ResolvedStory,
): Promise<Story> => {
  const { sentenceIds, pathIds, defaults } = resolved
  const leafPathId = pathIds.at(-1) ?? null
  const knownPathIds = pathIds.filter((id): id is number => id !== null)

  const [sentences, titles, like] = await Promise.all([
    loadSentences(db, sentenceIds),
    knownPathIds.length
      ? db
          .selectFrom('titles')
          .select(['path_id', 'slug', 'title'])
          .where('path_id', 'in', knownPathIds)
          .execute()
      : [],
    viewer && leafPathId
      ? db
          .selectFrom('likes')
          .select('path_id')
          .where('user_id', '=', viewer.id)
          .where('path_id', '=', leafPathId)
          .executeTakeFirst()
      : undefined,
  ])
  const titleByPath = new Map(titles.map((t) => [t.path_id, t]))

  const ownSentenceIds = viewer
    ? sentenceIds.filter((id) => sentences.get(id)?.author?.id === viewer.id)
    : []
  const [editable, forks] = await Promise.all([
    editableSentences(db, ownSentenceIds),
    loadForks(db, sentenceIds, defaults),
  ])

  const lines = sentenceIds.flatMap((id, i): StoryLine[] => {
    if (id === ROOT_ID) {
      return []
    }
    const sentence = present(sentences.get(id))
    const pathId = pathIds[i]
    const prefix = threadOf(sentenceIds.slice(0, i + 1), defaults)
    return [
      {
        ...sentence,
        index: i,
        permalink: permalink(
          prefix,
          pathId ? titleByPath.get(pathId)?.slug : undefined,
        ),
        editable: editable.has(id),
        fork: null,
      },
    ]
  })
  // Each fork lists all alternatives on the story up to the line before
  for (const [i, line] of lines.entries()) {
    const fork = forks.get(line.index)
    const previous = lines[i - 1]
    if (fork && previous) {
      line.fork = { ...fork, allPermalink: previous.permalink }
    }
  }

  const isRoot = sentenceIds.at(-1) === ROOT_ID
  const leaf = isRoot ? undefined : lines.at(-1)
  const title = leafPathId ? (titleByPath.get(leafPathId) ?? null) : null

  return {
    thread: resolved.thread,
    isRoot,
    permalink: permalink(resolved.thread, title?.slug),
    title: title?.title ?? null,
    lines,
    liked: Boolean(like),
    canUnlink: viewer ? await canUnlink(db, viewer, resolved) : false,
    isLeafAuthor: Boolean(viewer && leaf?.author?.id === viewer.id),
  }
}

// For each position after the first sentence, the other live sentences
// that follow the sentence before it. The first sentence has none: its
// alternatives would be every other beginning.
const loadForks = async (
  db: Db,
  sentenceIds: number[],
  defaults: DefaultParents,
): Promise<Map<number, Omit<Fork, 'allPermalink'>>> => {
  const positions = sentenceIds
    .map((id, index) => ({ id, index, parent: sentenceIds[index - 1] }))
    .filter(
      (p): p is { id: number; index: number; parent: number } =>
        p.index >= 2 && p.parent !== undefined,
    )
  const forks = new Map<number, Omit<Fork, 'allPermalink'>>()
  if (!positions.length) {
    return forks
  }
  const rows = await db
    .selectFrom('links as l')
    .innerJoin('sentences as c', 'c.id', 'l.to_sentence_id')
    .select(['l.from_sentence_id as parent', 'c.id', 'c.content'])
    .where(
      'l.from_sentence_id',
      'in',
      positions.map((p) => p.parent),
    )
    .where('c.deleted_at', 'is', null)
    .orderBy('c.id')
    .execute()
  const childrenOf = new Map<number, { id: number; content: string }[]>()
  for (const row of rows) {
    childrenOf.set(row.parent, [...(childrenOf.get(row.parent) ?? []), row])
  }
  const shown = new Map<number, { id: number; content: string }[]>()
  for (const { id, index, parent } of positions) {
    const others = (childrenOf.get(parent) ?? []).filter((c) => c.id !== id)
    if (others.length) {
      shown.set(index, others)
    }
  }
  const optionIds = [...shown.values()].flatMap((others) =>
    others.slice(0, FORK_OPTIONS).map((c) => c.id),
  )
  const allDefaults = new Map([
    ...defaults,
    ...(await loadDefaultParents(db, optionIds)),
  ])
  for (const [index, others] of shown) {
    forks.set(index, {
      count: others.length,
      options: others.slice(0, FORK_OPTIONS).map((c) => ({
        id: c.id,
        content: c.content,
        permalink: permalink(
          threadOf([...sentenceIds.slice(0, index), c.id], allDefaults),
        ),
      })),
    })
  }
  return forks
}

// The step into the leaf, if it is not the default parent
export const leafStep = ({ sentenceIds, defaults }: ResolvedStory) => {
  const leaf = sentenceIds.at(-1)
  const parent = sentenceIds.at(-2)
  if (leaf === undefined || parent === undefined) {
    return null
  }
  return defaults.get(leaf) === parent ? null : { parent, leaf }
}

const canUnlink = async (
  db: Db,
  viewer: NonNullable<Viewer>,
  resolved: ResolvedStory,
) => {
  const step = leafStep(resolved)
  if (!step) {
    return false
  }
  const link = await db
    .selectFrom('links')
    .select('author_id')
    .where('from_sentence_id', '=', step.parent)
    .where('to_sentence_id', '=', step.leaf)
    .executeTakeFirst()
  if (link?.author_id !== viewer.id) {
    return false
  }
  return !(await isStepProtected(db, step.parent, step.leaf, viewer.id))
}

export type ChildItem = {
  key: string
  sentenceId: number
  content: string
  permalink: string
}

type Candidate = { sentence_id: number }

const candidatesSql = (story: ResolvedStory): RawBuilder<Candidate> => sql`
  select l.to_sentence_id as sentence_id
  from app.links l
  join app.sentences s on s.id = l.to_sentence_id
  where l.from_sentence_id = ${last(story.sentenceIds)}
    and s.deleted_at is null
`

// Sentences linked from the story's last sentence; at the root, the
// beginnings
export const getChildren = async (
  db: Db,
  story: ResolvedStory,
  params: PageParams,
): Promise<{ page: Page<ChildItem>; count: number }> => {
  const candidates = candidatesSql(story)
  const leafPathId = story.pathIds.at(-1) ?? null
  let page: Page<Candidate>
  if (params.order === 'popular') {
    const { rows } = await sql<Candidate>`
      with recursive ${popularityScores(
        sql`select 0 as grp, ${leafPathId}::bigint as parent_path, sentence_id
          from (${candidates}) c`,
      )}
      select cand.sentence_id
      from cand left join scores using (grp, sentence_id)
      order by ${popularOrder}
      limit ${PAGE_SIZE + 1} offset ${popularOffset(params.page)}
    `.execute(db)
    page = popularPage(rows, params.page ?? 1)
  } else {
    const { cursor, op, direction } = keysetQuery(params)
    const { rows } = await sql<Candidate>`
      with cand as (${candidates})
      select sentence_id from cand
      ${cursor ? sql`where sentence_id ${sql.raw(op)} ${cursor}` : sql``}
      order by sentence_id ${sql.raw(direction)}
      limit ${PAGE_SIZE + 1}
    `.execute(db)
    page = keysetPage(rows, params, (c) => c.sentence_id)
  }
  const { rows: countRows } = await sql<{ count: number }>`
    with cand as (${candidates}) select count(*)::int as count from cand
  `.execute(db)

  const childIds = page.items.map((c) => c.sentence_id)
  const sequences = childIds.map((id) => [...story.sentenceIds, id])
  const [sentences, defaults, slugs] = await Promise.all([
    loadSentences(db, childIds),
    loadDefaultParents(db, sequences.flat()),
    childSlugs(db, leafPathId, childIds),
  ])
  return {
    count: countRows[0]?.count ?? 0,
    page: {
      ...page,
      items: childIds.map((id, i) => ({
        key: String(id),
        sentenceId: id,
        content: sentences.get(id)?.content ?? '',
        permalink: permalink(
          threadOf(present(sequences[i]), defaults),
          slugs.get(id),
        ),
      })),
    },
  }
}

// Slugs of the children's paths that are titled
const childSlugs = async (
  db: Db,
  parentPathId: number | null,
  childIds: number[],
) => {
  if (!parentPathId || !childIds.length) {
    return new Map<number, string>()
  }
  const rows = await db
    .selectFrom('paths as p')
    .innerJoin('titles as t', 't.path_id', 'p.id')
    .select(['p.sentence_id', 't.slug'])
    .where('p.sentence_id', 'in', childIds)
    .where('p.parent_id', '=', parentPathId)
    .execute()
  return new Map(rows.map((r) => [r.sentence_id, r.slug]))
}

export type LinkCandidate = {
  id: number
  content: string
  hasParent: boolean
  hasChild: boolean
}

export type LinkQuery = {
  from: number
  direction: LinkDirection
  search?: string
  after?: number
  before?: number
}

// Sentences that could be linked into a story: those matching a search, or
// those near `from` in the graph (its siblings, or the siblings of its
// parents or of its children), oldest first.
export const getLinkCandidates = async (
  db: Db,
  query: LinkQuery,
): Promise<Page<LinkCandidate>> => {
  const { from, direction, search } = query
  let matches: RawBuilder<{ id: number }>
  if (search) {
    matches = sql`
      select s.id from app.sentences s
      where s.content ilike ${searchPattern(search)}
    `
  } else if (direction === 'parents') {
    // Siblings of its parents
    matches = sql`
      select sibling.to_sentence_id from app.links up
      join app.links grand on grand.to_sentence_id = up.from_sentence_id
      join app.links sibling on sibling.from_sentence_id = grand.from_sentence_id
      where up.to_sentence_id = ${from}
    `
  } else if (direction === 'children') {
    // Siblings of its children
    matches = sql`
      select sibling.to_sentence_id from app.links down
      join app.links other on other.to_sentence_id = down.to_sentence_id
      join app.links sibling on sibling.from_sentence_id = other.from_sentence_id
      where down.from_sentence_id = ${from}
    `
  } else {
    matches = sql`
      select sibling.to_sentence_id from app.links up
      join app.links sibling on sibling.from_sentence_id = up.from_sentence_id
      where up.to_sentence_id = ${from}
    `
  }
  const params = {
    order: 'oldest' as const,
    after: query.after,
    before: query.after ? undefined : query.before,
  }
  const { cursor, op, direction: sort } = keysetQuery(params)
  const { rows } = await sql<LinkCandidate>`
    select s.id, s.content,
      -- Tracing back finds nothing when the only parent is the root
      exists (
        select 1 from app.links l
        where l.to_sentence_id = s.id and l.from_sentence_id <> ${ROOT_ID}
      ) as "hasParent",
      exists (
        select 1 from app.links l
        join app.sentences c on c.id = l.to_sentence_id and c.deleted_at is null
        where l.from_sentence_id = s.id
      ) as "hasChild"
    from app.sentences s
    where s.id in (${matches})
      and s.id <> ${ROOT_ID}
      and s.deleted_at is null
      ${cursor ? sql`and s.id ${sql.raw(op)} ${cursor}` : sql``}
    order by s.id ${sql.raw(sort)}
    limit ${PAGE_SIZE + 1}
  `.execute(db)
  return keysetPage(rows, params, (c) => c.id)
}
