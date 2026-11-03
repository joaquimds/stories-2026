import { type Kysely, sql } from 'kysely'

// Indexes for foreign keys that queries filter by, or that deletes cascade
// through: a writer's titles, a fragment's reports (deleting a fragment), a
// user's reset tokens (resetting a password) and the reports they made
export const up = async (db: Kysely<unknown>) => {
  await sql`
    create index on app.titles (author_id);
    create index on app.reports (sentence_id);
    create index on app.reports (reporter_id);
    create index on app.password_reset_tokens (user_id);
  `.execute(db)
}

export const down = async (db: Kysely<unknown>) => {
  await sql`
    drop index app.titles_author_id_idx;
    drop index app.reports_sentence_id_idx;
    drop index app.reports_reporter_id_idx;
    drop index app.password_reset_tokens_user_id_idx;
  `.execute(db)
}
