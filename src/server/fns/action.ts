import { ActionError, type Result } from '../../domain/errors.ts'
import { requireUser } from '../auth/request.ts'
import { type Db, db } from '../db/index.ts'
import type { Author } from '../data/sentences.ts'

// Runs an action in a transaction, turning expected failures into results
export const runAction = async <T extends object>(
  fn: (trx: Db) => Promise<T>,
): Promise<Result<T>> => {
  try {
    const value = await db().transaction().execute(fn)
    return { ok: true, ...value }
  } catch (error) {
    if (error instanceof ActionError) {
      return { ok: false, error: error.message }
    }
    throw error
  }
}

// As runAction, for signed-in users only
export const runUserAction = <T extends object>(
  fn: (trx: Db, viewer: Author) => Promise<T>,
) =>
  runAction(async (trx) => {
    const user = await requireUser()
    return fn(trx, { id: user.id, name: user.name })
  })
