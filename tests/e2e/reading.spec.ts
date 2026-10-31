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
  await expect(page).toHaveTitle('The Bridge | Follow')
  // The bridge was linked to the clearing
  await page
    .getByRole('link', { name: 'At the clearing, he found her waiting.' })
    .click()
  await expect(page).toHaveURL(/\/s\/\d+\.\d+-\d+$/)
  // ...and the clearing loops back to the garden
  // (from the list of continuations, once the clearing's page has loaded)
  await page
    .locator('main ul li')
    .getByRole('link', { name: 'In the garden, the paths forked.' })
    .click()
  await expect(
    page.locator('main').getByText('In the garden, the paths forked.'),
  ).toHaveCount(2)
})

test('shows a not found page for unknown stories', async ({ page }) => {
  const response = await page.goto('/s/999999')
  expect(response?.status()).toBe(404)
  await expect(page.getByText('Not found')).toBeVisible()
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

test('links to the contact address', async ({ page }) => {
  await page.goto('/faq')
  await expect(page.getByRole('link', { name: 'Contact' })).toHaveAttribute(
    'href',
    'mailto:stories@joaqu.im',
  )
  await expect(
    page.getByRole('main').getByRole('link', { name: 'stories@joaqu.im' }),
  ).toBeVisible()
})

test('lists recent sentences and loose ends', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Recent' }).click()
  await expect(page.getByRole('heading', { name: 'Recent' })).toBeVisible()
  await expect(
    page.getByRole('link', {
      name: 'Every night, the lighthouse blinked a different message.',
    }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Loose ends' }).click()
  await expect(page).toHaveURL(/loose=true/)
  // The garden has continuations, so it isn't a loose end
  await expect(
    page.getByRole('link', { name: 'In the garden, the paths forked.' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('link', {
      name: 'Except the youngest, who had never learned to read.',
    }),
  ).toBeVisible()
})

test('reads a random story', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'read a random story' }).click()
  await expect(page).toHaveURL(/\/s\//)
  await expect(page.locator('main').getByText(/^By /)).toBeVisible()
})

test('reads a story as one piece', async ({ page }) => {
  await page.goto('/s/The_Bridge')
  await page.getByRole('link', { name: 'read as one piece' }).click()
  await expect(page).toHaveURL('/read/The_Bridge')
  await expect(page.getByRole('heading', { name: 'The Bridge' })).toBeVisible()
  await expect(page.locator('article')).toContainText(
    'In the garden, the paths forked. She took the left path, towards the river.',
  )
  await page.getByRole('link', { name: '(back to the story)' }).click()
  await expect(page).toHaveURL('/s/The_Bridge')
})

test('shows where a story could have gone another way', async ({ page }) => {
  await page.goto('/s/The_Bridge')
  await page.getByRole('button', { name: '1 other path here' }).click()
  await page
    .getByRole('link', { name: '→ He took the right path, into the trees.' })
    .click()
  await expect(
    page.locator('main').getByText('He took the right path, into the trees.'),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/s\/\d+$/)
})

test('opens a writer’s page from a byline', async ({ page }) => {
  await page.goto('/s/The_Bridge')
  await page.locator('main').getByRole('link', { name: 'Bob' }).click()
  await expect(page).toHaveURL('/w/Bob')
  await expect(page.getByRole('heading', { name: 'Bob' })).toBeVisible()
  await expect(
    page.getByRole('link', {
      name: 'She took the left path, towards the river.',
    }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Titled' }).click()
  await expect(page.getByRole('heading', { name: 'The Bridge' })).toBeVisible()
})

test('gives stories their own share image', async ({ page, request }) => {
  await page.goto('/s/The_Bridge')
  const image = page.locator('meta[property="og:image"]')
  await expect(image).toHaveCount(1)
  const url = new URL((await image.getAttribute('content'))!)
  expect(url.pathname).toBe('/og/The_Bridge')
  const response = await request.get(url.pathname)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/png')
})

test('maps the branches around a story', async ({ page }) => {
  await page.goto('/s/The_Bridge')
  await page.getByRole('link', { name: 'map', exact: true }).click()
  await expect(page).toHaveURL('/map/The_Bridge')
  await expect(
    page.getByRole('heading', { name: 'Map of The Bridge' }),
  ).toBeVisible()
  const map = page.getByRole('img', { name: "Map of the story's branches" })
  await expect(map).toBeVisible()
  // The clearing was linked after the bridge
  await map.getByRole('link', { name: /At the clearing/ }).click()
  await expect(page).toHaveURL(/\/s\/\d+\.\d+-\d+$/)
})
