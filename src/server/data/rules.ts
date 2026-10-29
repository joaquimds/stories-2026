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
        where s.deleted_at is null
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
