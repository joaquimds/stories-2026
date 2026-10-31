import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

export const MIN_PASSWORD_LENGTH = 8

// scrypt costs: 32 MB of memory per hash. They are stored with each hash,
// so they can be raised later without breaking existing passwords.
const COST = { N: 2 ** 15, r: 8, p: 1 }
const KEY_LENGTH = 64

const derive = (password: string, salt: Buffer, { N, r, p }: typeof COST) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      // Room above the 128 * N * r bytes scrypt needs
      { N, r, p, maxmem: 256 * N * r },
      (error, key) => (error ? reject(error) : resolve(key)),
    )
  })

// Stored as "scrypt$N$r$p$salt$key", the last two in base64url
export const hashPassword = async (password: string) => {
  const salt = randomBytes(16)
  const key = await derive(password, salt, COST)
  const { N, r, p } = COST
  return [
    'scrypt',
    N,
    r,
    p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$')
}

export const verifyPassword = async (password: string, stored: string) => {
  const [scheme, N, r, p, salt, key] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !key) {
    return false
  }
  const expected = Buffer.from(key, 'base64url')
  const actual = await derive(password, Buffer.from(salt, 'base64url'), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
