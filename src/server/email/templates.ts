// Emails styled like the app: EB Garamond (Georgia where web fonts aren't
// loaded), the app's greys, sentences as cards and buttons like `.button`.
// Table layout and inline styles, as email clients need.
import { SITE_DESCRIPTION, SITE_TITLE } from '../../lib/site.ts'
import { env } from '../env.ts'
import type { Email } from './smtp2go.ts'

const COLORS = {
  black: '#333333',
  white: '#ffffff',
  greyDark: '#666666',
  greyLight: '#ebebeb',
  greyTint: '#f5f5f5',
}

const FONT = "'EB Garamond', Georgia, 'Times New Roman', serif"

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const style = (rules: Record<string, string | number>) =>
  Object.entries(rules)
    .map(
      ([key, value]) =>
        `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value}`,
    )
    .join(';')

const paragraph = (html: string) =>
  `<p style="${style({ margin: '0 0 16px', fontSize: '17px', lineHeight: '1.5' })}">${html}</p>`

const heading = (text: string) =>
  `<h1 style="${style({
    margin: '0 0 16px',
    fontFamily: FONT,
    fontSize: '26px',
    fontWeight: 'bold',
    lineHeight: '1.2',
  })}">${escapeHtml(text)}</h1>`

const link = (url: string, text: string) =>
  `<a href="${escapeHtml(url)}" style="${style({ color: COLORS.black })}">${text}</a>`

// Like the app's `.button`
const button = (url: string, text: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px">
    <tr><td style="${style({
      background: COLORS.greyTint,
      border: `1px solid ${COLORS.greyDark}`,
      borderRadius: '4px',
    })}">
      <a href="${escapeHtml(url)}" style="${style({
        display: 'inline-block',
        padding: '8px 20px',
        color: COLORS.black,
        fontFamily: FONT,
        fontSize: '17px',
        textDecoration: 'none',
      })}">${escapeHtml(text)}</a>
    </td></tr>
  </table>`

// A sentence as a card, like the children of a story in the app
const card = (content: string, url: string) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px">
    <tr><td style="${style({
      padding: '16px',
      border: `1px solid ${COLORS.greyLight}`,
      borderRadius: '8px',
      boxShadow: `0 0 8px ${COLORS.greyDark}`,
      textAlign: 'center',
      fontSize: '18px',
      lineHeight: '1.4',
    })}">
      <a href="${escapeHtml(url)}" style="${style({ color: COLORS.black, textDecoration: 'none' })}">${escapeHtml(content)}</a>
    </td></tr>
  </table>`

const layout = ({
  preview,
  body,
  footer = '',
}: {
  preview: string
  body: string
  footer?: string
}) => {
  const site = env().SITE_URL
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${SITE_TITLE}</title>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
</head>
<body style="${style({ margin: 0, padding: 0, background: COLORS.white })}">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${style({ background: COLORS.white })}">
  <tr><td align="center" style="padding:0 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${style(
      {
        maxWidth: '560px',
        fontFamily: FONT,
        color: COLORS.black,
      },
    )}">
      <tr><td style="${style({ padding: '8px 0', borderBottom: `1px solid ${COLORS.greyLight}` })}">
        <a href="${site}" style="${style({ color: COLORS.black, textDecoration: 'none', fontSize: '17px' })}">
          <img src="${site}/email-logo.png" width="64" height="48" alt="" style="vertical-align:middle;border:0;margin-right:4px">
          <span style="vertical-align:middle">${SITE_TITLE}</span>
        </a>
      </td></tr>
      <tr><td style="padding:32px 0 8px">${body}</td></tr>
      <tr><td style="${style({
        padding: '12px 0 32px',
        borderTop: `1px solid ${COLORS.greyLight}`,
        color: COLORS.greyDark,
        fontSize: '14px',
        lineHeight: '1.5',
      })}">
        ${footer}<em>${SITE_DESCRIPTION}</em>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

const prettyJoin = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

export const passwordResetEmail = (to: string, token: string): Email => {
  const url = `${env().SITE_URL}/reset#${token}`
  return {
    to,
    subject: 'Password reset',
    text: [
      'Reset your password',
      `Go to ${url} to choose a new password. The link expires in an hour.`,
      "If you didn't ask to reset your password, you can ignore this email.",
    ].join('\n\n'),
    html: layout({
      preview: 'Choose a new password. The link expires in an hour.',
      body:
        heading('Reset your password') +
        paragraph(
          'Use the button below to choose a new password. The link expires in an hour.',
        ) +
        button(url, 'Reset password') +
        paragraph(
          `<span style="color:${COLORS.greyDark};font-size:15px">If you didn't ask to reset your password, you can ignore this email.</span>`,
        ),
    }),
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
    subject: `Fragment reported: ${sentenceId}`,
    text: [`A reader reported fragment ${sentenceId}:`, content, url].join(
      '\n\n',
    ),
    html: layout({
      preview: content,
      body:
        heading('A fragment was reported') +
        paragraph(`A reader reported fragment ${sentenceId}:`) +
        card(content, url) +
        button(url, 'View it in its story'),
    }),
  }
}

export type DigestSentence = { content: string; path: string }

// A story someone favourited or titled: its title, else its last sentence
export type DigestStory = { label: string; path: string }

export type Digest = {
  // New sentences, under each author's name
  additions: Map<string, DigestSentence[]>
  // Stories with the reader's writing, under the name of whoever
  // favourited or titled them
  favourites: Map<string, DigestStory[]>
  titles: Map<string, DigestStory[]>
}

const countOf = (byName: Map<string, unknown[]>) =>
  [...byName.values()].flat().length

const storiesWord = (count: number) => (count > 1 ? 'stories' : 'story')

// What happened in the reader's stories since the last digest, each as a
// card that opens it
export const digestEmail = (to: string, digest: Digest): Email => {
  const site = env().SITE_URL
  const account = `${site}/account`
  const { additions, favourites, titles } = digest

  const summary = [
    additions.size
      ? `${prettyJoin([...additions.keys()])} added to your ${storiesWord(countOf(additions))}.`
      : null,
    favourites.size
      ? `${prettyJoin([...favourites.keys()])} favourited your ${storiesWord(countOf(favourites))}.`
      : null,
    titles.size
      ? `${prettyJoin([...titles.keys()])} titled your ${storiesWord(countOf(titles))}.`
      : null,
  ].filter((line): line is string => line !== null)

  const [subject, title] = additions.size
    ? ['Your story was added to!', 'Your story was added to']
    : favourites.size
      ? ['Your story was favourited!', 'Your story was favourited']
      : ['Your story was given a title!', 'Your story was given a title']

  let text = `${summary.join(' ')}\n\n`
  let body = heading(title) + paragraph(escapeHtml(summary.join(' ')))
  const section = <T>(
    byName: Map<string, T[]>,
    verb: string,
    entry: (item: T) => { label: string; path: string },
  ) => {
    for (const [name, items] of byName) {
      text += `${name} ${verb}:\n\n`
      body += paragraph(`<strong>${escapeHtml(name)}</strong> ${verb}:`)
      for (const item of items) {
        const { label, path } = entry(item)
        text += `  ${label}\n  ${site}${path}\n\n`
        body += card(label, `${site}${path}`)
      }
    }
  }
  section(additions, 'wrote', ({ content, path }) => ({ label: content, path }))
  section(favourites, 'favourited', (story) => story)
  section(titles, 'titled', (story) => story)
  text += `You can turn off these emails on your account page: ${account}`
  return {
    to,
    subject,
    text,
    html: layout({
      preview: summary.join(' '),
      body: body + button(site, 'Back to the beginning'),
      footer: `You can turn off these emails on your ${link(account, 'account page')}.<br>`,
    }),
  }
}
