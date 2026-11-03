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
  // The garden was linked straight to the clearing last
  await expect(children.first()).toHaveText(
    'At the clearing, he found her waiting.',
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
    'mailto:tree@joaqu.im',
  )
  await expect(
    page.getByRole('main').getByRole('link', { name: 'tree@joaqu.im' }),
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
  await page.getByRole('link', { name: 'random', exact: true }).click()
  await expect(page).toHaveURL(/\/s\//)
  await expect(page.locator('main').getByText(/^By /)).toBeVisible()
})

test('shows where a story could have gone another way', async ({ page }) => {
  await page.goto('/s/The_Bridge')
  await page.getByRole('button', { name: '2 other paths here' }).click()
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
  const content = await image.getAttribute('content')
  expect(content).not.toBeNull()
  const url = new URL(content ?? '')
  expect(url.pathname).toBe('/og/The_Bridge')
  const response = await request.get(url.pathname)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/png')
})

test('maps the branches around a story', async ({ page }) => {
  // The layout settles at once, so the dots hold still to be clicked
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/s/The_Bridge')
  await page.getByRole('link', { name: '(map)' }).click()
  await expect(page).toHaveURL('/map/The_Bridge')
  await expect(page.getByRole('heading', { name: 'The Bridge' })).toBeVisible()
  const map = page.getByRole('img', { name: "Map of the story's branches" })
  const dot = (name: RegExp) => map.getByRole('link', { name })
  await expect(dot(/She took the left path/)).toHaveCount(1)
  // A dot moves along the map (the clearing was linked after the bridge),
  // keeping what was already there
  await dot(/At the clearing/).click()
  await expect(page).toHaveURL(/\/map\/\d+\.\d+-\d+$/)
  await expect(dot(/She took the left path/)).toHaveCount(1)
  // Each sentence appears once, even where a loop leads back to it
  await expect(dot(/In the garden/)).toHaveCount(1)
  // The sentence in its popover opens the story: focus a dot, then Tab to
  // its sentence
  await dot(/She took the left path/).focus()
  await page.keyboard.press('Tab')
  const sentence = page
    .getByRole('tooltip')
    .getByRole('link', { name: /She took the left path/ })
  await expect(sentence).toBeFocused()
  await page.keyboard.press('Enter')
  // The shortest walk from the clearing goes on round the loop, back
  // through the garden to the left path, rather than three steps back
  await expect(page).toHaveURL(/\/s\/\d+\.\d+-\d+/)
  await expect(
    page.locator('main').getByText('She took the left path'),
  ).toHaveCount(2)
})

test('loads what leads into the earliest sentence on a map', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // Along the bridge, over the crossing, and on past the clearing
  await page.goto('/map/The_Bridge')
  const map = page.getByRole('img', { name: "Map of the story's branches" })
  await map.getByRole('link', { name: /At the clearing/ }).click()
  await map.getByRole('link', { name: /Neither of them/ }).click()
  await expect(page).toHaveURL(/\/map\/\d+\.\d+-\d+$/)
  // Fresh, the map starts after the beginning
  await page.reload()
  const beginning = map.getByRole('link', { name: '(the beginning)' })
  await expect(beginning).toHaveCount(0)
  // Clicking the earliest moves there, like any dot, and loads what leads
  // into it, losing nothing already on the map
  const url = page.url()
  await map.getByRole('link', { name: /She took the left path/ }).click()
  await expect(beginning).toHaveCount(1)
  await expect(page).not.toHaveURL(url)
  await expect(map.getByRole('link', { name: /Neither of them/ })).toHaveCount(
    1,
  )
})
