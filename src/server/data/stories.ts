import { type RawBuilder, sql } from 'kysely'
import {
  PAGE_SIZE,
  type Page,
  type PageParams,
} from '../../domain/pagination.ts'
import type { LinkDirection } from '../../domain/search.ts'
import type { Db } from '../db/index.ts'
import {
  keysetPage,
  keysetQuery,
  popularOffset,
  popularPage,
  searchPattern,
} from './paging.ts'
import {
  type ResolvedStory,
  loadDefaultParents,
  permalink,
  threadOf,
} from './paths.ts'
import { editableSentences, isStepProtected } from './rules.ts'
import { type SentenceRow, loadSentences } from './sentences.ts'

export type Viewer = { id: number; name: string } | null

export type StoryLine = SentenceRow & {
  // Permalink of the story up to and including this sentence
  permalink: string
  editable: boolean
}

export type Story = {
  thread: string
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
  const editable = await editableSentences(db, ownSentenceIds)

  const lines = sentenceIds.map((id, i): StoryLine => {
    const sentence = sentences.get(id) as SentenceRow
    const pathId = pathIds[i]
    const prefix = threadOf(sentenceIds.slice(0, i + 1), defaults)
    return {
      ...sentence,
      permalink: permalink(
        prefix,
        pathId ? titleByPath.get(pathId)?.slug : undefined,
      ),
      editable: editable.has(id),
    }
  })

  const leaf = lines.at(-1)
  const title = leafPathId ? (titleByPath.get(leafPathId) ?? null) : null

  return {
    thread: resolved.thread,
    permalink: permalink(resolved.thread, title?.slug),
    title: title?.title ?? null,
    lines,
    liked: Boolean(like),
    canUnlink: viewer ? await canUnlink(db, viewer, resolved) : false,
    isLeafAuthor: Boolean(viewer && leaf?.author?.id === viewer.id),
  }
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

type Candidate = { sentence_id: number; via: number }

// Children of a story, or the beginnings when `story` is null. Beginnings
// include the children of deleted beginnings, reached through them.
const candidatesSql = (story: ResolvedStory | null): RawBuilder<Candidate> => {
  if (!story) {
    return sql`
      select s.id as sentence_id, 0::bigint as via,
        null::bigint as parent_path, true as at_root
      from app.sentences s
      where s.written_under_path_id is null and s.deleted_at is null
      union all
      select c.id, x.id, xp.id, false
      from app.sentences x
      join app.links l on l.from_sentence_id = x.id
      join app.sentences c on c.id = l.to_sentence_id and c.deleted_at is null
      left join app.paths xp on xp.parent_id is null and xp.sentence_id = x.id
      where x.written_under_path_id is null and x.deleted_at is not null
    `
  }
  const leaf = story.sentenceIds.at(-1) as number
  const leafPathId = story.pathIds.at(-1) ?? null
  return sql`
    select l.to_sentence_id as sentence_id, 0::bigint as via,
      ${leafPathId}::bigint as parent_path, false as at_root
    from app.links l
    join app.sentences s on s.id = l.to_sentence_id
    where l.from_sentence_id = ${leaf} and s.deleted_at is null
  `
}

export const getChildren = async (
  db: Db,
  story: ResolvedStory | null,
  params: PageParams,
): Promise<{ page: Page<ChildItem>; count: number }> => {
  const candidates = candidatesSql(story)
  let page: Page<Candidate>
  if (params.order === 'popular') {
    const { rows } = await sql<Candidate>`
      with recursive
        cand as (${candidates}),
        sub(sentence_id, via, here, path_id) as (
          select c.sentence_id, c.via,
            coalesce(case when c.at_root then p.parent_id is null
              else p.parent_id = c.parent_path end, false),
            p.id
          from cand c join app.paths p on p.sentence_id = c.sentence_id
          union all
          select sub.sentence_id, sub.via, sub.here, p.id
          from sub join app.paths p on p.parent_id = sub.path_id
        ),
        scores as (
          select sub.sentence_id, sub.via,
            count(distinct c.user_id) filter (where sub.here) as here_score,
            count(distinct c.user_id) as score
          from sub
          join app.contributions c on c.path_id = sub.path_id
          where c.kind in ('write', 'like')
          group by sub.sentence_id, sub.via
        )
      select cand.sentence_id, cand.via
      from cand left join scores using (sentence_id, via)
      order by coalesce(here_score, 0) desc, coalesce(score, 0) desc,
        cand.sentence_id, cand.via
      limit ${PAGE_SIZE + 1} offset ${popularOffset(params.page)}
    `.execute(db)
    page = popularPage(rows, params.page ?? 1)
  } else {
    const { cursor, op, direction } = keysetQuery(params)
    const { rows } = await sql<Candidate>`
      with cand as (${candidates})
      select sentence_id, via from cand
      ${cursor ? sql`where sentence_id ${sql.raw(op)} ${cursor}` : sql``}
      order by sentence_id ${sql.raw(direction)}, via
      limit ${PAGE_SIZE + 1}
    `.execute(db)
    page = keysetPage(rows, params, (c) => c.sentence_id)
  }
  const { rows: countRows } = await sql<{ count: number }>`
    with cand as (${candidates}) select count(*)::int as count from cand
  `.execute(db)

  const sequences = page.items.map((c) => {
    if (!story) {
      return c.via ? [c.via, c.sentence_id] : [c.sentence_id]
    }
    return [...story.sentenceIds, c.sentence_id]
  })
  const [sentences, defaults, slugs] = await Promise.all([
    loadSentences(
      db,
      page.items.map((c) => c.sentence_id),
    ),
    loadDefaultParents(db, sequences.flat()),
    childSlugs(db, story, page.items),
  ])
  return {
    count: countRows[0]?.count ?? 0,
    page: {
      ...page,
      items: page.items.map((c, i) => {
        const thread = threadOf(sequences[i] as number[], defaults)
        return {
          key: `${c.via}-${c.sentence_id}`,
          sentenceId: c.sentence_id,
          content: sentences.get(c.sentence_id)?.content ?? '',
          permalink: permalink(
            thread,
            c.via ? undefined : slugs.get(c.sentence_id),
          ),
        }
      }),
    },
  }
}

const childSlugs = async (
  db: Db,
  story: ResolvedStory | null,
  items: Candidate[],
) => {
  const parentPathId = story ? (story.pathIds.at(-1) ?? null) : null
  if (!items.length || (story && !parentPathId)) {
    return new Map<number, string>()
  }
  const rows = await db
    .selectFrom('paths as p')
    .innerJoin('titles as t', 't.path_id', 'p.id')
    .select(['p.sentence_id', 't.slug'])
    .where(
      'p.sentence_id',
      'in',
      items.map((c) => c.sentence_id),
    )
    .where((eb) =>
      parentPathId
        ? eb('p.parent_id', '=', parentPathId)
        : eb('p.parent_id', 'is', null),
    )
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
  // Parent-child edges, with a virtual root (0) as the parent of every
  // beginning, so beginnings are each other's siblings
  const edges = sql`
    select from_sentence_id as parent, to_sentence_id as child from app.links
    union all
    select 0, id from app.sentences where written_under_path_id is null
  `
  let matches: RawBuilder<{ id: number }>
  if (search) {
    matches = sql`
      select s.id from app.sentences s
      where s.content ilike ${searchPattern(search)}
    `
  } else if (direction === 'parents') {
    // Siblings of its parents
    matches = sql`
      with e as (${edges})
      select sibling.child from e up
      join e grand on grand.child = up.parent
      join e sibling on sibling.parent = grand.parent
      where up.child = ${from}
    `
  } else if (direction === 'children') {
    // Siblings of its children
    matches = sql`
      with e as (${edges})
      select sibling.child from e down
      join e other on other.child = down.child
      join e sibling on sibling.parent = other.parent
      where down.parent = ${from}
    `
  } else {
    matches = sql`
      with e as (${edges})
      select sibling.child from e up
      join e sibling on sibling.parent = up.parent
      where up.child = ${from}
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
      exists (select 1 from app.links l where l.to_sentence_id = s.id) as "hasParent",
      exists (
        select 1 from app.links l
        join app.sentences c on c.id = l.to_sentence_id and c.deleted_at is null
        where l.from_sentence_id = s.id
      ) as "hasChild"
    from app.sentences s
    where s.id in (${matches})
      and s.deleted_at is null
      ${cursor ? sql`and s.id ${sql.raw(op)} ${cursor}` : sql``}
    order by s.id ${sql.raw(sort)}
    limit ${PAGE_SIZE + 1}
  `.execute(db)
  return keysetPage(rows, params, (c) => c.id)
}
