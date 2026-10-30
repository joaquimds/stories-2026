import { expect, test } from '@playwright/test'

test('reads a story from a beginning and navigates back', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('(choose a beginning')).toBeVisible()
  await page
    .getByRole('link', { name: 'In the garden, the paths forked.' })
    .click()
  await expect(page).toHaveURL(/\/s\/\d+$/)
  await page
    .getByRole('link', { name: 'She took the left path, towards the river.' })
    .click()

  const main = page.locator('main')
  await expect(main.getByText('In the garden, the paths forked.')).toBeVisible()
  await expect(
    main.getByText('She took the left path, towards the river.'),
  ).toBeVisible()
  await expect(main.getByText('By Ana and Bob')).toBeVisible()
  await expect(main.getByRole('link', { name: 'download' })).toBeVisible()

  // Earlier sentences link to the story up to that point
  await main
    .getByRole('link', { name: 'In the garden, the paths forked.' })
    .click()
  await expect(
    main.getByRole('link', { name: 'He took the right path, into the trees.' }),
  ).toBeVisible()
})

test('sorts children and keeps the order in the URL', async ({ page }) => {
  await page.goto('/s/1')
  await page.getByRole('link', { name: 'Newest' }).click()
  await expect(page).toHaveURL(/order=newest/)
  const children = page.locator('main ul li')
  await expect(children.first()).toHaveText(
    'He took the right path, into the trees.',
  )
  await page.getByRole('link', { name: 'Oldest' }).click()
  await expect(children.first()).toHaveText(
    'She took the left path, towards the river.',
  )
})

test('shows titled stories by slug, through links and loops', async ({
  page,
}) => {
  await page.goto('/s/The_Bridge')
  await expect(page.getByRole('heading', { name: 'The Bridge' })).toBeVisible()
  await expect(page).toHaveTitle('The Bridge | Tree of Tales')
  // The bridge was linked to the clearing
  await page
    .getByRole('link', { name: 'At the clearing, he found her waiting.' })
    .click()
  await expect(page).toHaveURL(/\/s\/\d+\.\d+-\d+$/)
  // ...and the clearing loops back to the garden
  await page
    .getByRole('link', { name: 'In the garden, the paths forked.' })
    .last()
    .click()
  await expect(
    page.locator('main').getByText('In the garden, the paths forked.'),
  ).toHaveCount(2)
})

test('shows a not found page for unknown stories', async ({ page }) => {
  const response = await page.goto('/s/999999')
  expect(response?.status()).toBe(404)
  await expect(page.getByText('Not Found')).toBeVisible()
})

test('searches and sorts the library', async ({ page }) => {
  await page.goto('/library')
  const titles = page.locator('main h2')
  await expect(titles).toHaveText(['The Bridge', 'Waiting'])
  await page.getByLabel('Search by title').fill('wait')
  await expect(titles).toHaveText(['Waiting'])
  await expect(page).toHaveURL(/q=wait/)
})

test('shows stats', async ({ page }) => {
  await page.goto('/stats')
  await expect(page.getByRole('row', { name: /Titled stories/ })).toContainText(
    '2',
  )
  await expect(page.getByText('Loops in the tree')).toBeVisible()
})

test('redirects the root thread to the home page', async ({ page }) => {
  await page.goto('/s/0')
  await expect(page).toHaveURL('/')
})
