import { env } from '../env.ts'
import type { Email } from './smtp2go.ts'

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const layout = (body: string) =>
  `<div style="font-family: 'EB Garamond', Georgia, serif; color: #333333; font-size: 16px">${body}</div>`

const prettyJoin = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

export const passwordResetEmail = (to: string, token: string): Email => {
  const url = `${env().SITE_URL}/reset#${token}`
  return {
    to,
    subject: 'Password reset',
    text: `Go to ${url} to reset your password. The link expires in an hour.`,
    html: layout(
      `<p>Click here to reset your password: <a href="${url}">${url}</a></p>` +
        '<p>The link expires in an hour.</p>',
    ),
  }
}

export const reportEmail = (
  to: string,
  sentenceId: number,
  content: string,
  storyPath: string,
): Email => {
  const url = `${env().SITE_URL}${storyPath}`
  return {
    to,
    subject: `Sentence Reported: ${sentenceId}`,
    text: `${content}\n\n${url}`,
    html: layout(
      `<p>${escapeHtml(content)}</p><p><a href="${url}">${url}</a></p>`,
    ),
  }
}

// One line per author: "Read what X wrote here and here."
export const digestEmail = (
  to: string,
  byAuthor: Map<string, string[]>,
): Email => {
  const site = env().SITE_URL
  let text = ''
  let html = ''
  for (const [author, paths] of byAuthor) {
    const urls = paths.map((path) => `${site}${path}`)
    text += `Read what ${author} wrote at ${prettyJoin(urls)}\n\n`
    html += `<p>Read what ${escapeHtml(author)} wrote ${prettyJoin(
      urls.map((url) => `<a href="${url}">here</a>`),
    )}.</p>`
  }
  text += 'You can turn off these emails on your account page.'
  html += `<p>You can turn off these emails on your <a href="${site}/account">account page</a>.</p>`
  return { to, subject: 'Your story was added to!', text, html: layout(html) }
}
