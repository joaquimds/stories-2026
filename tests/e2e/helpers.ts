import { createHash } from 'node:crypto'
import { type Page, expect } from '@playwright/test'
import pg from 'pg'
import {
  E2E_DATABASE_URL,
  E2E_SESSION_SECRET,
} from '../../playwright.config.ts'

// Seeded accounts all use this password
export const PASSWORD = 'password'

export const unique = (text: string) =>
  `${text} ${Math.random().toString(36).slice(2, 8)}`

export const login = async (page: Page, email: string, password = PASSWORD) => {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Account' })).toBeVisible()
}

export const query = async <T>(text: string, values: unknown[] = []) => {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL })
  await client.connect()
  try {
    return (await client.query(text, values)).rows as T[]
  } finally {
    await client.end()
  }
}

// Reset emails are only logged in tests, so plant a token we know
export const plantResetToken = async (email: string, token: string) => {
  const hash = createHash('sha256')
    .update(token + E2E_SESSION_SECRET)
    .digest('hex')
  await query(
    `insert into app.password_reset_tokens (token_hash, user_id, expires_at)
     select $1, id, now() + interval '1 hour' from app.users where email = $2`,
    [hash, email],
  )
}

// Writes a sentence in the Write panel and waits for its page
export const writeSentence = async (page: Page, content: string) => {
  await page.getByRole('textbox', { name: 'Write' }).fill(content)
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText(content, { exact: true }).first()).toBeVisible()
  await expect(page).toHaveURL(/\/s\/\d+/)
  // Let the navigation settle before typing anything else
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('textbox', { name: 'Write' })).toHaveValue('')
}

export const storyText = (page: Page) => page.locator('main div').first()
