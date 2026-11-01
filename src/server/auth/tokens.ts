import { createHash, randomBytes } from 'node:crypto'
import { env } from '../env.ts'

export const generateToken = () => randomBytes(32).toString('base64url')

// Only hashes of session and reset tokens are stored
export const hashToken = (token: string) =>
  createHash('sha256')
    .update(token + env().SESSION_SECRET)
    .digest('hex')
