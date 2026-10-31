import { sql } from 'kysely'
import { ActionError } from '../../domain/errors.ts'
import {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  verifyPassword,
} from '../auth/passwords.ts'
import { deleteUserSessions } from '../auth/sessions.ts'
import { generateToken, hashToken } from '../auth/tokens.ts'
import type { Db } from '../db/index.ts'
import { passwordResetEmail } from '../email/templates.ts'
import { enqueue } from '../jobs/boss.ts'

const RESET_TOKEN_MS = 60 * 60 * 1000

// Compared against when an email is unknown, so timing reveals nothing
const DUMMY_HASH =
  'scrypt$32768$8$1$NI3oZcqTsLo65Z8XU3giSg$6PnAzZ9CwipYDfJJ5ow03GTXnw3C9kBcshpjWBmAmGsBk9wBWr9-ojtjFdV7bb8bOY4evzSnESWH907DTVCFOg'

const checkPassword = (password: string) => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ActionError(
      'invalid',
      `Passwords must be at least ${MIN_PASSWORD_LENGTH} characters`,
    )
  }
}

export const register = async (
  db: Db,
  input: {
    name: string
    email: string
    password: string
    isNotifiable: boolean
  },
) => {
  checkPassword(input.password)
  const name = input.name.trim()
  const email = input.email.trim()
  if (!name || !email) {
    throw new ActionError('invalid')
  }
  const passwordHash = await hashPassword(input.password)
  const row = await db
    .insertInto('users')
    .values({
      name,
      email,
      password_hash: passwordHash,
      is_notifiable: input.isNotifiable,
    })
    .onConflict((oc) => oc.doNothing())
    .returning('id')
    .executeTakeFirst()
  if (!row) {
    // Pen names and emails compare case-insensitively (citext)
    const nameTaken = await db
      .selectFrom('users')
      .select('id')
      .where('name', '=', name)
      .executeTakeFirst()
    throw new ActionError(
      'duplicate',
      nameTaken
        ? 'That pen name is taken'
        : 'There is already an account with that email address',
    )
  }
  return row.id
}

export const authenticate = async (db: Db, email: string, password: string) => {
  const user = await db
    .selectFrom('users')
    .select(['id', 'password_hash'])
    .where('email', '=', email.trim())
    .executeTakeFirst()
  const valid = await verifyPassword(
    password,
    user?.password_hash ?? DUMMY_HASH,
  )
  if (!user || !valid) {
    throw new ActionError('credentials')
  }
  return user.id
}

export const requestPasswordReset = async (trx: Db, email: string) => {
  const user = await trx
    .selectFrom('users')
    .select(['id', 'email'])
    .where('email', '=', email.trim())
    .executeTakeFirst()
  // Respond the same way whether or not the account exists
  if (!user) {
    return
  }
  const token = generateToken()
  await trx
    .insertInto('password_reset_tokens')
    .values({
      token_hash: hashToken(token),
      user_id: user.id,
      expires_at: new Date(Date.now() + RESET_TOKEN_MS),
    })
    .execute()
  await enqueue(trx, 'send-email', passwordResetEmail(user.email, token))
}

export const resetPassword = async (
  trx: Db,
  token: string,
  password: string,
) => {
  checkPassword(password)
  const row = await trx
    .deleteFrom('password_reset_tokens')
    .where('token_hash', '=', hashToken(token))
    .returning(['user_id', 'expires_at'])
    .executeTakeFirst()
  if (!row) {
    throw new ActionError(
      'notFound',
      'This reset link is invalid or has been used',
    )
  }
  if (row.expires_at.getTime() < Date.now()) {
    throw new ActionError('expired', 'This reset link has expired')
  }
  await trx
    .updateTable('users')
    .set({ password_hash: await hashPassword(password) })
    .where('id', '=', row.user_id)
    .execute()
  await trx
    .deleteFrom('password_reset_tokens')
    .where('user_id', '=', row.user_id)
    .execute()
  await deleteUserSessions(trx, row.user_id)
}

export const updateSettings = async (
  db: Db,
  userId: number,
  settings: { isNotifiable: boolean },
) => {
  await db
    .updateTable('users')
    .set({
      is_notifiable: settings.isNotifiable,
      // Don't send a backlog to someone turning notifications back on
      last_notified_at: sql<Date>`case when is_notifiable then last_notified_at else now() end`,
    })
    .where('id', '=', userId)
    .execute()
}

export type AuthorProfile = {
  id: number
  name: string
  since: string
  sentences: number
  titles: number
}

// A writer's public profile, found by pen name (case-insensitively)
export const findAuthor = async (
  db: Db,
  name: string,
): Promise<AuthorProfile | null> => {
  const row = await db
    .selectFrom('users as u')
    .select((eb) => [
      'u.id',
      'u.name',
      'u.created_at',
      eb
        .selectFrom('sentences as s')
        .select((e) => e.fn.countAll<number>().as('n'))
        .whereRef('s.author_id', '=', 'u.id')
        .where('s.deleted_at', 'is', null)
        .as('sentences'),
      eb
        .selectFrom('titles as t')
        .select((e) => e.fn.countAll<number>().as('n'))
        .whereRef('t.author_id', '=', 'u.id')
        .as('titles'),
    ])
    .where('u.name', '=', name)
    .executeTakeFirst()
  return row
    ? {
        id: row.id,
        name: row.name,
        since: row.created_at.toISOString(),
        sentences: Number(row.sentences ?? 0),
        titles: Number(row.titles ?? 0),
      }
    : null
}
