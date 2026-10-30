import { type Kysely, sql } from 'kysely'

export const up = async (db: Kysely<unknown>) => {
  await sql`
    create extension if not exists citext;
    create extension if not exists pg_trgm;

    create table app.users (
      id bigint generated always as identity primary key,
      email citext unique not null,
      name citext unique not null,
      password_hash text not null,
      is_notifiable boolean not null default true,
      last_notified_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    );

    create table app.sessions (
      id text primary key,
      user_id bigint not null references app.users on delete cascade,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    );
    create index on app.sessions (user_id);

    create table app.password_reset_tokens (
      token_hash text primary key,
      user_id bigint not null references app.users on delete cascade,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    );

    create table app.rate_limits (
      key text not null,
      window_start timestamptz not null,
      count integer not null default 1,
      primary key (key, window_start)
    );

    -- Sentence 0 is the root: the parent of every beginning, and the home
    -- page. It is the only sentence without an author or a parent path.
    create table app.sentences (
      id bigint generated always as identity primary key,
      content text not null,
      author_id bigint references app.users,
      written_under_path_id bigint,
      deleted_at timestamptz,
      created_at timestamptz not null default now(),
      check (
        case when id = 0
          then content = '' and author_id is null
            and written_under_path_id is null and deleted_at is null
          else char_length(content) between 1 and 280
            and author_id is not null and written_under_path_id is not null
        end
      )
    );

    create table app.paths (
      id bigint generated always as identity primary key,
      parent_id bigint references app.paths on delete cascade,
      sentence_id bigint not null references app.sentences on delete cascade,
      created_at timestamptz not null default now(),
      unique nulls not distinct (parent_id, sentence_id)
    );

    alter table app.sentences
      add foreign key (written_under_path_id) references app.paths;

    create table app.links (
      id bigint generated always as identity primary key,
      from_sentence_id bigint not null references app.sentences on delete cascade,
      to_sentence_id bigint not null references app.sentences on delete cascade,
      author_id bigint references app.users,
      created_at timestamptz not null default now(),
      unique (from_sentence_id, to_sentence_id),
      check (to_sentence_id <> 0)
    );

    create table app.likes (
      user_id bigint not null references app.users on delete cascade,
      path_id bigint not null references app.paths on delete cascade,
      created_at timestamptz not null default now(),
      primary key (user_id, path_id)
    );

    create table app.titles (
      path_id bigint primary key references app.paths on delete cascade,
      title text not null,
      slug text unique not null,
      author_id bigint not null references app.users,
      created_at timestamptz not null default now()
    );

    create table app.reports (
      id bigint generated always as identity primary key,
      sentence_id bigint not null references app.sentences on delete cascade,
      reporter_id bigint references app.users on delete set null,
      created_at timestamptz not null default now()
    );

    create index on app.paths (parent_id);
    create index on app.paths (sentence_id);
    create index on app.links (to_sentence_id);
    create index on app.sentences (author_id);
    create index on app.sentences (written_under_path_id);
    create index on app.links (author_id);
    create index on app.likes (path_id);
    create index on app.sentences using gin (content gin_trgm_ops);
    create index on app.titles using gin (title gin_trgm_ops);

    insert into app.sentences (id, content) overriding system value values (0, '');
    insert into app.paths (parent_id, sentence_id) values (null, 0);

    create view app.contributions as
      select s.author_id as user_id, p.id as path_id, 'write'::text as kind, s.created_at
      from app.sentences s
      join app.paths p
        on p.sentence_id = s.id
        and p.parent_id is not distinct from s.written_under_path_id
      where s.deleted_at is null and s.id <> 0
      union all
      select user_id, path_id, 'like', created_at from app.likes
      union all
      select author_id, path_id, 'title', created_at from app.titles;
  `.execute(db)
}

export const down = async (db: Kysely<unknown>) => {
  await sql`
    drop view app.contributions;
    drop table app.reports, app.titles, app.likes, app.links,
      app.sentences, app.paths, app.rate_limits, app.password_reset_tokens,
      app.sessions, app.users cascade;
  `.execute(db)
}
