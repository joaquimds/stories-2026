import { type Page, expect, test } from '@playwright/test'
import { login, unique, writeSentence } from './helpers.ts'

const main = (page: Page) => page.locator('main')

// Log in once: logins are rate limited
const STATE = 'test-results/bob.json'

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  })
  const page = await context.newPage()
  await login(page, 'bob@example.com')
  await context.storageState({ path: STATE })
  await context.close()
})

test.use({ storageState: STATE })

test('writes a new story and continues it', async ({ page }) => {
  const first = unique('Once upon a time')
  const second = unique('there was a test')
  await page.goto('/')
  await writeSentence(page, first)
  await expect(main(page).getByText("(tale's end;")).toBeVisible()
  await writeSentence(page, second)
  await expect(main(page).getByRole('button', { name: first })).toBeVisible()
  await expect(main(page).getByRole('button', { name: second })).toBeVisible()
  await expect(main(page).getByText('By Bob')).toBeVisible()

  await page.goto('/')
  await page.getByRole('link', { name: 'Newest' }).click()
  await expect(page.locator('main ul li').first()).toHaveText(first)
})

test('edits in place and writes a variation', async ({ page }) => {
  const first = unique('A first line')
  const second = unique('A second line')
  await page.goto('/')
  await writeSentence(page, first)
  await writeSentence(page, second)
  const url = page.url()

  await main(page).getByRole('button', { name: second }).click()
  await main(page).getByRole('button', { name: 'edit' }).click()
  await main(page)
    .getByRole('textbox', { name: 'Fragment' })
    .fill(`${second}, edited`)
  await main(page).getByRole('button', { name: 'save', exact: true }).click()
  await expect(
    main(page).getByRole('button', { name: `${second}, edited` }),
  ).toBeVisible()
  expect(page.url()).toBe(url)

  const branch = unique('A different first line')
  await main(page).getByRole('button', { name: first }).click()
  await main(page).getByRole('button', { name: 'write a variation' }).click()
  await main(page).getByRole('textbox', { name: 'Fragment' }).fill(branch)
  await main(page).getByRole('button', { name: 'save variation' }).click()
  await expect(main(page).getByRole('button', { name: branch })).toBeVisible()
  await expect(
    main(page).getByRole('button', { name: `${second}, edited` }),
  ).toBeVisible()
  await expect(main(page).getByRole('button', { name: first })).toHaveCount(0)
  expect(page.url()).not.toBe(url)
})

test('titles a story into the library', async ({ page }) => {
  const title = unique('Test Title')
  await page.goto('/')
  await writeSentence(page, unique('A titled beginning'))
  await main(page).getByRole('button', { name: 'title', exact: true }).click()
  await page.getByLabel('Title').fill(title)
  await main(page).getByRole('button', { name: 'save', exact: true }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(page).toHaveURL(`/s/${title.replaceAll(' ', '_')}`)

  await page.goto('/library?order=newest')
  await expect(page.locator('main h2').first()).toHaveText(title)
})

test('favourites a story', async ({ page }) => {
  await page.goto('/s/The_Bridge')
  await main(page)
    .getByRole('button', { name: 'favourite', exact: true })
    .click()
  await expect(
    main(page).getByRole('button', { name: 'unfavourite' }),
  ).toBeVisible()

  await page.goto('/account/favourites')
  await expect(
    main(page).getByRole('heading', { name: 'The Bridge' }),
  ).toBeVisible()

  await page.goto('/s/The_Bridge')
  await main(page).getByRole('button', { name: 'unfavourite' }).click()
  await expect(
    main(page).getByRole('button', { name: 'favourite', exact: true }),
  ).toBeVisible()
})

test('deletes a sentence', async ({ page }) => {
  const doomed = unique('A doomed line')
  await page.goto('/s/1')
  const parent = page.url()
  await writeSentence(page, doomed)
  await main(page).getByRole('button', { name: 'delete' }).click()
  await expect(page).toHaveURL(parent)
  await expect(main(page).getByText(doomed)).toHaveCount(0)
})

test('links to another sentence and unlinks it', async ({ page }) => {
  const start = unique('A line that links')
  await page.goto('/')
  await writeSentence(page, start)
  const before = page.url()

  await page.getByRole('link', { name: 'Link', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search' }).fill('lighthouse')
  const target = 'Every night, the lighthouse blinked a different message.'
  await page.getByRole('button', { name: `→ ${target}` }).click()
  await expect(page).toHaveURL(/\/s\/\d+\.\d+-\d+$/)
  await expect(main(page).getByRole('button', { name: target })).toBeVisible()

  await page.goto('/account/links')
  await expect(
    main(page).getByRole('link', { name: `${start} → ${target}` }),
  ).toBeVisible()
  await main(page)
    .getByRole('link', { name: `${start} → ${target}` })
    .click()

  await main(page).getByRole('button', { name: 'unlink' }).click()
  await expect(page).toHaveURL(before)
  await expect(main(page).getByText(target)).toHaveCount(0)
})

test('browses relatives in the link panel', async ({ page }) => {
  // A beginning's siblings are the other beginnings
  await page.goto('/s/1?tab=link')
  await expect(
    page.getByRole('button', {
      name: '→ The letter arrived a hundred years late.',
    }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'ahead', exact: true }).first().click()
  await expect(page).toHaveURL(/l\.dir=children/)
  await expect(
    page.getByRole('button', {
      name: '→ She took the left path, towards the river.',
    }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'back', exact: true }).first().click()
  await expect(page).toHaveURL(/l\.dir=parents/)
  await expect(
    page.getByRole('button', { name: '→ In the garden, the paths forked.' }),
  ).toBeVisible()
})

test('lists fragments on the account page', async ({ page }) => {
  await page.goto('/account')
  await page.getByRole('link', { name: 'Your fragments' }).click()
  await expect(
    main(page).getByRole('link', {
      name: 'She took the left path, towards the river.',
    }),
  ).toBeVisible()
  await page.getByLabel('Search').fill('bridge')
  await expect(main(page).locator('li')).toHaveCount(1)
})

test('links an existing sentence as a new beginning', async ({ page }) => {
  const target = 'Except the youngest, who had never learned to read.'
  await page.goto('/')
  await page.getByRole('link', { name: 'Link', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search' }).fill('youngest')
  await page.getByRole('button', { name: `→ ${target}` }).click()
  await expect(page).toHaveURL(/\/s\/\d+\.\d+-0$/)

  await page.goto('/?order=newest')
  await expect(page.locator('main ul li').getByText(target)).toBeVisible()

  await page.locator('main ul li').getByText(target).click()
  await page.getByRole('button', { name: 'unlink' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.locator('main ul li').getByText(target)).toHaveCount(0)
})

test('writes, links, unlinks and deletes on the map', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const first = unique('A map beginning')
  const second = unique('Written on the map')
  await page.goto('/')
  await writeSentence(page, first)
  await page.getByRole('link', { name: '(map)' }).click()
  await expect(page).toHaveURL(/\/map\//)
  const map = page.getByRole('img', { name: "Map of the story's branches" })
  const plus = map.getByRole('button', { name: 'Write or link from here' })
  const box = await map.boundingBox()
  if (!box) throw new Error('no map')
  // An empty spot, away from the dots in the middle
  const empty = { x: box.x + 40, y: box.y + box.height - 60 }
  await map.hover()

  // The + brings out an arrow; Escape and a right click put it away
  await plus.click()
  await expect(plus).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(plus).toHaveAttribute('aria-pressed', 'false')
  await plus.click()
  await page.mouse.click(empty.x, empty.y, { button: 'right' })
  await expect(plus).toHaveAttribute('aria-pressed', 'false')

  // The arrow landing in empty space opens a card to write in, which its ×
  // closes and opens again with the draft kept
  await plus.click()
  await page.mouse.click(empty.x, empty.y)
  const card = page.getByRole('form', { name: 'Write a new fragment' })
  await card.getByRole('textbox', { name: 'Write' }).fill(second)
  await card.getByRole('button', { name: 'Close' }).click()
  await expect(card).toHaveCount(0)
  await plus.click()
  await page.mouse.click(empty.x, empty.y)
  await expect(card.getByRole('textbox', { name: 'Write' })).toHaveValue(second)
  await card.getByRole('button', { name: 'Submit' }).click()
  await expect(map.getByRole('link', { name: second })).toHaveCount(1)
  const written = page.url()

  // The arrow landing on a dot links to it
  await map.hover()
  await plus.click()
  await map.getByRole('link', { name: `Link to ${first}` }).click()
  await expect(page).not.toHaveURL(written)
  await expect(map.getByRole('link', { name: first })).toHaveCount(1)

  // Unlink it again, from where you are, back to where it was made
  const popover = page.getByRole('tooltip')
  await map.getByRole('link', { name: first, exact: true }).hover()
  await popover.getByRole('button', { name: 'unlink' }).click()
  await expect(page).toHaveURL(written)

  // Delete what was written, and its dot goes
  await map.getByRole('link', { name: second, exact: true }).hover()
  await popover.getByRole('button', { name: 'delete' }).click()
  await expect(map.getByRole('link', { name: second })).toHaveCount(0)
  await expect(map.getByRole('link', { name: first })).toHaveCount(1)
})
