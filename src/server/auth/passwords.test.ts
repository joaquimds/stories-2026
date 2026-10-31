import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './passwords.ts'

describe('passwords', () => {
  it('verifies the right password and rejects others', async () => {
    const hash = await hashPassword('correct horse')
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/)
    expect(await verifyPassword('correct horse', hash)).toBe(true)
    expect(await verifyPassword('Correct horse', hash)).toBe(false)
  })

  it('salts each hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'))
  })

  it('rejects malformed hashes', async () => {
    expect(await verifyPassword('x', '')).toBe(false)
    expect(await verifyPassword('x', '$2b$12$notscrypt')).toBe(false)
  })
})
