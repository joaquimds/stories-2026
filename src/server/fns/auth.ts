import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { LIMITS, enforceLimit } from '../auth/rate-limit.ts'
import {
  clearSessionCookie,
  clientIp,
  currentUser,
  sessionToken,
  setSessionCookie,
} from '../auth/request.ts'
import { createSession, deleteSession } from '../auth/sessions.ts'
import { db } from '../db/index.ts'
import {
  authenticate,
  register as registerUser,
  requestPasswordReset,
  resetPassword as reset,
  updateSettings as update,
} from '../data/users.ts'
import { runAction, runUserAction } from './action.ts'

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email())
  .pipe(z.string().max(254))
const password = z.string().min(1).max(200)

export const getCurrentUser = createServerFn({ method: 'GET' }).handler(() =>
  currentUser(),
)

export const register = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      name: z.string().trim().min(1).max(50),
      email,
      password,
      isNotifiable: z.boolean(),
    }),
  )
  .handler(({ data }) =>
    runAction(async (trx) => {
      await enforceLimit(db(), [`register:ip:${clientIp()}`], LIMITS.register)
      const userId = await registerUser(trx, data)
      setSessionCookie(await createSession(trx, userId))
      return {}
    }),
  )

export const login = createServerFn({ method: 'POST' })
  .validator(z.object({ email, password }))
  .handler(({ data }) =>
    runAction(async (trx) => {
      // Counted outside the transaction, so failed attempts count too
      await enforceLimit(
        db(),
        [`login:ip:${clientIp()}`, `login:email:${data.email}`],
        LIMITS.login,
      )
      const userId = await authenticate(trx, data.email, data.password)
      setSessionCookie(await createSession(trx, userId))
      return {}
    }),
  )

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  const token = sessionToken()
  if (token) {
    await deleteSession(db(), token)
  }
  clearSessionCookie()
  return { ok: true }
})

export const forgotPassword = createServerFn({ method: 'POST' })
  .validator(z.object({ email }))
  .handler(({ data }) =>
    runAction(async (trx) => {
      await enforceLimit(
        db(),
        [`forgot:ip:${clientIp()}`, `forgot:email:${data.email}`],
        LIMITS.forgotPassword,
      )
      await requestPasswordReset(trx, data.email)
      return {}
    }),
  )

export const resetPassword = createServerFn({ method: 'POST' })
  .validator(z.object({ token: z.string().min(1).max(200), password }))
  .handler(({ data }) =>
    runAction(async (trx) => {
      await reset(trx, data.token, data.password)
      return {}
    }),
  )

export const updateSettings = createServerFn({ method: 'POST' })
  .validator(z.object({ isNotifiable: z.boolean() }))
  .handler(({ data }) =>
    runUserAction(async (trx, viewer) => {
      await update(trx, viewer.id, data)
      return {}
    }),
  )
