export const ERRORS = {
  invalid: 'Invalid request',
  credentials: 'Wrong email or password',
  forbidden: 'Forbidden',
  notFound: 'Not found',
  duplicate: 'Duplicate',
  expired: 'Expired',
  rateLimited: 'Too many attempts, please try again later',
} as const

export type ErrorCode = keyof typeof ERRORS

export class ActionError extends Error {
  code: ErrorCode

  constructor(code: ErrorCode, message: string = ERRORS[code]) {
    super(message)
    this.code = code
  }
}

export type Result<T> = ({ ok: true } & T) | { ok: false; error: string }
