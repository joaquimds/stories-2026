// Writes each email template, with sample content, to an HTML file.
// Usage: node --env-file=.env scripts/preview-emails.ts [directory]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  digestEmail,
  passwordResetEmail,
  reportEmail,
} from '../src/server/email/templates.ts'

const dir = process.argv[2] ?? 'email-previews'
mkdirSync(dir, { recursive: true })

const emails = {
  'password-reset': passwordResetEmail('ana@example.com', 'sample-token'),
  report: reportEmail(
    'admin@example.com',
    42,
    'The river was louder than she remembered.',
    '/s/4',
  ),
  digest: digestEmail(
    'ana@example.com',
    new Map([
      [
        'Bob',
        [
          { content: 'A bridge appeared where none had been.', path: '/s/5' },
          {
            content: 'Neither of them could say how they had got there.',
            path: '/s/8.8-7',
          },
        ],
      ],
      [
        'Cat',
        [{ content: 'The trees leaned in to listen.', path: '/s/The_Trees' }],
      ],
    ]),
  ),
}

for (const [name, email] of Object.entries(emails)) {
  writeFileSync(join(dir, `${name}.html`), email.html)
  writeFileSync(
    join(dir, `${name}.txt`),
    `Subject: ${email.subject}\n\n${email.text}`,
  )
  console.info(`${join(dir, name)}.html — ${email.subject}`)
}
