import type { Db } from '../db/index.ts'
import { generateToken, hashToken } from './tokens.ts'

export const SESSION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const sessionExpiry = () => new Date(Date.now() + SESSION_DAYS * DAY_MS)

export type SessionUser = {
  id: number
  name: string
  email: string
  isNotifiable: boolean
}

export const createSession = async (db: Db, userId: number) => {
  const token = generateToken()
  await db
    .insertInto('sessions')
    .values({
      id: hashToken(token),
      user_id: userId,
      expires_at: sessionExpiry(),
    })
    .execute()
  return token
}

// Resolves a session token to its user, extending the session at most once
// a day. Returns `renewed` so the caller can refresh the cookie.
export const resolveSession = async (db: Db, token: string) => {
  const id = hashToken(token)
  const row = await db
    .selectFrom('sessions as s')
    .innerJoin('users as u', 'u.id', 's.user_id')
    .select(['s.expires_at', 'u.id', 'u.name', 'u.email', 'u.is_notifiable'])
    .where('s.id', '=', id)
    .executeTakeFirst()
  if (!row) {
    return null
  }
  if (row.expires_at.getTime() < Date.now()) {
    await db.deleteFrom('sessions').where('id', '=', id).execute()
    return null
  }
  const renewed =
    row.expires_at.getTime() - Date.now() < (SESSION_DAYS - 1) * DAY_MS
  if (renewed) {
    await db
      .updateTable('sessions')
      .set({ expires_at: sessionExpiry() })
      .where('id', '=', id)
      .execute()
  }
  const user: SessionUser = {
    id: row.id,
    name: row.name,
    email: row.email,
    isNotifiable: row.is_notifiable,
  }
  return { user, renewed }
}

export const deleteSession = (db: Db, token: string) =>
  db.deleteFrom('sessions').where('id', '=', hashToken(token)).execute()

export const deleteUserSessions = (db: Db, userId: number) =>
  db.deleteFrom('sessions').where('user_id', '=', userId).execute()
