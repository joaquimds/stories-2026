import { expect, test } from '@playwright/test'
import { login, plantResetToken, unique } from './helpers.ts'

test('registers, logs out and logs back in', async ({ page }) => {
  const name = unique('Writer').replace(' ', '')
  const email = `${name.toLowerCase()}@example.com`
  await page.goto('/login')
  await page.getByRole('button', { name: 'Register' }).click()
  await page.getByLabel('Pen Name').fill(name)
  await page.getByLabel('Email Address').fill(email)
  await page.getByLabel('Password').fill('a good password')
  await page.locator('button.submit').click()
  await expect(page.getByRole('link', { name: 'Account' })).toBeVisible()

  await page.getByRole('link', { name: 'Account' }).click()
  await page.getByRole('button', { name: 'Log Out' }).click()
  await expect(
    page.getByRole('link', { name: 'Login', exact: true }),
  ).toBeVisible()

  await login(page, email, 'a good password')
})

test('rejects bad credentials', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email Address').fill('ana@example.com')
  await page.getByLabel('Password').fill('not the password')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page.getByText('Bad credentials')).toBeVisible()
})

test('resets a forgotten password', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Forgot password' }).click()
  await page.getByLabel('Email Address').fill('cat@example.com')
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText('Please check your email')).toBeVisible()

  await plantResetToken('cat@example.com', 'e2e-reset-token')
  await page.goto('/reset#e2e-reset-token')
  await page.getByLabel('Password', { exact: true }).fill('a new password')
  await page.getByLabel('Confirm password').fill('a new password')
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await login(page, 'cat@example.com', 'a new password')

  // Put it back for other tests
  await plantResetToken('cat@example.com', 'e2e-reset-token-2')
  await page.goto('/account')
  await page.getByRole('button', { name: 'Log Out' }).click()
  await expect(
    page.getByRole('link', { name: 'Login', exact: true }),
  ).toBeVisible()
  await page.goto('/reset#e2e-reset-token-2')
  await page.getByLabel('Password', { exact: true }).fill('password')
  await page.getByLabel('Confirm password').fill('password')
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('requires login for account pages', async ({ page }) => {
  await page.goto('/account/fragments')
  await expect(page).toHaveURL(/\/login$/)
})

test('writes before logging in, then publishes', async ({ page }) => {
  const sentence = unique('Written before logging in')
  await page.goto('/s/The_Bridge')
  await page.getByRole('textbox', { name: 'Write' }).fill(sentence)
  await page.getByRole('button', { name: 'Login to publish' }).click()
  await expect(page).toHaveURL(/\/login\?next=/)
  await expect(page.getByText('taken back to your story')).toBeVisible()

  await page.getByLabel('Email Address').fill('ana@example.com')
  await page.getByLabel('Password').fill('password')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page).toHaveURL('/s/The_Bridge')
  await expect(page.getByRole('textbox', { name: 'Write' })).toHaveValue(
    sentence,
  )
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(
    page.locator('main').getByRole('button', { name: sentence }),
  ).toBeVisible()
  // The draft is gone once published
  await page.goto('/s/The_Bridge')
  await expect(page.getByRole('textbox', { name: 'Write' })).toHaveValue('')
})
