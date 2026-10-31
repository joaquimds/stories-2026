// The database's tables, as Kysely sees them. Kept by hand: update it with
// each migration. Bigint ids and counts are parsed to numbers (see index.ts).

import type { ColumnType } from 'kysely'

export type Generated<T> =
  T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>

export type Timestamp = ColumnType<Date, Date | string, Date | string>

export interface Contributions {
  created_at: Date
  kind: 'write' | 'like' | 'title'
  path_id: number
  user_id: number
}

export interface Likes {
  created_at: Generated<Timestamp>
  path_id: number
  user_id: number
}

export interface Links {
  author_id: number | null
  created_at: Generated<Timestamp>
  from_sentence_id: number
  id: Generated<number>
  to_sentence_id: number
}

export interface PasswordResetTokens {
  created_at: Generated<Timestamp>
  expires_at: Timestamp
  token_hash: string
  user_id: number
}

export interface Paths {
  created_at: Generated<Timestamp>
  id: Generated<number>
  parent_id: number | null
  sentence_id: number
}

export interface RateLimits {
  count: Generated<number>
  key: string
  window_start: Timestamp
}

export interface Reports {
  created_at: Generated<Timestamp>
  id: Generated<number>
  reporter_id: number | null
  sentence_id: number
}

export interface Sentences {
  author_id: number | null
  content: string
  created_at: Generated<Timestamp>
  deleted_at: Timestamp | null
  id: Generated<number>
  written_under_path_id: number | null
}

export interface Sessions {
  created_at: Generated<Timestamp>
  expires_at: Timestamp
  id: string
  user_id: number
}

export interface Titles {
  author_id: number
  created_at: Generated<Timestamp>
  path_id: number
  slug: string
  title: string
}

export interface Users {
  created_at: Generated<Timestamp>
  email: string
  id: Generated<number>
  is_notifiable: Generated<boolean>
  last_notified_at: Generated<Timestamp>
  name: string
  password_hash: string
}

export interface DB {
  contributions: Contributions
  likes: Likes
  links: Links
  password_reset_tokens: PasswordResetTokens
  paths: Paths
  rate_limits: RateLimits
  reports: Reports
  sentences: Sentences
  sessions: Sessions
  titles: Titles
  users: Users
}
