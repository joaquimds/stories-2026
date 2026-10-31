// Derived rules over the contributions view (plan §5)
import { sql } from 'kysely'
import type { Db } from '../db/index.ts'

// Sentences that nobody other than their author has a write, like or title
// contribution at or below any path ending at the sentence.
export const editableSentences = async (
  db: Db,
  sentenceIds: number[],
): Promise<Set<number>> => {
  if (!sentenceIds.length) {
    return new Set()
  }
  const { rows } = await sql<{ id: number }>`
    with recursive sub(sentence_id, id) as (
      select p.sentence_id, p.id from app.paths p
      where p.sentence_id = any(${sentenceIds}::bigint[])
      union all
      select sub.sentence_id, p.id from sub join app.paths p on p.parent_id = sub.id
    )
    select s.id from app.sentences s
    where s.id = any(${sentenceIds}::bigint[])
      and s.deleted_at is null
      and not exists (
        select 1 from sub
        join app.contributions c on c.path_id = sub.id
        where sub.sentence_id = s.id and c.user_id <> s.author_id
      )
  `.execute(db)
  return new Set(rows.map((r) => r.id))
}

// A step from `parentId` to `childId` (a link someone made) is protected
// when anyone has written or titled, or anyone other than the link author
// has liked, at or below a path that takes the step.
export const isStepProtected = async (
  db: Db,
  parentId: number,
  childId: number,
  linkAuthorId: number,
) => {
  const { rows } = await sql<{ protected: boolean }>`
    with recursive sub(id) as (
      select p.id from app.paths p
      join app.paths pp on pp.id = p.parent_id
      where pp.sentence_id = ${parentId} and p.sentence_id = ${childId}
      union all
      select p.id from sub join app.paths p on p.parent_id = sub.id
    )
    select
      exists (
        select 1 from sub join app.contributions c on c.path_id = sub.id
        where c.kind in ('write', 'title')
          or (c.kind = 'like' and c.user_id <> ${linkAuthorId})
      )
      -- deleted sentences are not contributions but still hang off the path
      or exists (
        select 1 from sub join app.sentences s on s.written_under_path_id = sub.id
      ) as protected
  `.execute(db)
  return rows[0]?.protected ?? false
}

export type DigestEntry = {
  userId: number
  email: string
  sentenceId: number
  content: string
  authorName: string
  originPathId: number
}

// For each notifiable user: sentences by other users, created after the
// user's last_notified_at and up to the cutoff, whose origin path passes
// through a sentence the user wrote.
export const digestEntries = async (
  db: Db,
  cutoff: Date,
): Promise<DigestEntry[]> => {
  const { rows } = await sql<DigestEntry>`
    with recursive
      fresh as (
        select s.id, s.author_id, p.id as origin_path_id
        from app.sentences s
        join app.paths p
          on p.sentence_id = s.id
          and p.parent_id is not distinct from s.written_under_path_id
        where s.deleted_at is null and s.author_id is not null
          and s.created_at <= ${cutoff}
          and s.created_at > (
            select coalesce(min(last_notified_at), ${cutoff})
            from app.users where is_notifiable
          )
      ),
      up(sentence_id, path_id) as (
        select f.id, f.origin_path_id from fresh f
        union all
        select up.sentence_id, p.parent_id
        from up join app.paths p on p.id = up.path_id
        where p.parent_id is not null
      )
    select distinct
      u.id as "userId",
      u.email,
      f.id as "sentenceId",
      s.content,
      a.name as "authorName",
      f.origin_path_id as "originPathId"
    from up
    join app.paths p on p.id = up.path_id
    join app.sentences ancestor on ancestor.id = p.sentence_id
    join app.users u on u.id = ancestor.author_id
    join fresh f on f.id = up.sentence_id
    join app.sentences s on s.id = f.id
    join app.users a on a.id = f.author_id
    where u.is_notifiable
      and ancestor.deleted_at is null
      and f.author_id <> u.id
      and s.created_at > u.last_notified_at
    order by "userId", "sentenceId"
  `.execute(db)
  return rows
}

export type DigestCredit = {
  userId: number
  email: string
  kind: 'like' | 'title'
  actorName: string
  pathId: number
}

// For each notifiable user: favourites and titles by other users, made
// after the user's last_notified_at and up to the cutoff, on stories that
// pass through a sentence the user wrote.
export const digestCredits = async (
  db: Db,
  cutoff: Date,
): Promise<DigestCredit[]> => {
  const { rows } = await sql<DigestCredit>`
    with recursive
      since as (
        select coalesce(min(last_notified_at), ${cutoff}) as at
        from app.users where is_notifiable
      ),
      events as (
        select 'like' as kind, l.user_id as actor, l.path_id, l.created_at
        from app.likes l, since
        where l.created_at <= ${cutoff} and l.created_at > since.at
        union all
        select 'title', t.author_id, t.path_id, t.created_at
        from app.titles t, since
        where t.created_at <= ${cutoff} and t.created_at > since.at
      ),
      up(kind, actor, story_path_id, created_at, path_id) as (
        select kind, actor, path_id, created_at, path_id from events
        union all
        select up.kind, up.actor, up.story_path_id, up.created_at, p.parent_id
        from up join app.paths p on p.id = up.path_id
        where p.parent_id is not null
      )
    select distinct
      u.id as "userId",
      u.email,
      up.kind,
      a.name as "actorName",
      up.story_path_id as "pathId"
    from up
    join app.paths p on p.id = up.path_id
    join app.sentences s on s.id = p.sentence_id and s.deleted_at is null
    join app.users u on u.id = s.author_id
    join app.users a on a.id = up.actor
    where u.is_notifiable
      and up.actor <> u.id
      and up.created_at > u.last_notified_at
    order by "userId", up.kind, "pathId"
  `.execute(db)
  return rows
}
