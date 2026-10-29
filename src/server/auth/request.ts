import {
  deleteCookie,
  getCookie,
  getRequest,
  getRequestIP,
  setCookie,
} from '@tanstack/react-start/server'
import { ActionError } from '../../domain/errors.ts'
import { db } from '../db/index.ts'
import { env } from '../env.ts'
import { SESSION_DAYS, type SessionUser, resolveSession } from './sessions.ts'

const COOKIE = 'session'

const resolved = new WeakMap<Request, Promise<SessionUser | null>>()

const resolveCurrentUser = async () => {
  const token = getCookie(COOKIE)
  if (!token) {
    return null
  }
  const session = await resolveSession(db(), token)
  if (!session) {
    deleteCookie(COOKIE, { path: '/' })
    return null
  }
  if (session.renewed) {
    setSessionCookie(token)
  }
  return session.user
}

// The signed-in user, resolved once per request
export const currentUser = () => {
  const request = getRequest()
  let user = resolved.get(request)
  if (!user) {
    user = resolveCurrentUser()
    resolved.set(request, user)
  }
  return user
}

export const requireUser = async () => {
  const user = await currentUser()
  if (!user) {
    throw new ActionError('forbidden', 'Please log in')
  }
  return user
}

export const sessionToken = () => getCookie(COOKIE)

export const setSessionCookie = (token: string) => {
  setCookie(COOKIE, token, {
    httpOnly: true,
    secure: env().SITE_URL.startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}

export const clearSessionCookie = () => deleteCookie(COOKIE, { path: '/' })

export const clientIp = () => getRequestIP({ xForwardedFor: true }) ?? 'unknown'
