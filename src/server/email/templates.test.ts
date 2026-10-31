import { describe, expect, it } from 'vitest'
import {
  type Digest,
  digestEmail,
  passwordResetEmail,
  reportEmail,
} from './templates.ts'

const digest = (parts: Partial<Digest>): Digest => ({
  additions: new Map(),
  favourites: new Map(),
  titles: new Map(),
  ...parts,
})

describe('email templates', () => {
  it('links the reset page with the token in the fragment', () => {
    const email = passwordResetEmail('ana@example.com', 'abc123')
    expect(email.html).toContain('href="http://localhost:3000/reset#abc123"')
    expect(email.text).toContain('http://localhost:3000/reset#abc123')
    expect(email.html).toContain('src="http://localhost:3000/email-logo.png"')
  })

  it('escapes what readers wrote', () => {
    const email = digestEmail(
      'ana@example.com',
      digest({
        additions: new Map([
          ['<b>Bob</b>', [{ content: 'A <script> & "quote"', path: '/s/5' }]],
        ]),
      }),
    )
    expect(email.html).not.toContain('<script>')
    expect(email.html).not.toContain('<b>Bob</b>')
    expect(email.html).toContain('A &lt;script&gt; &amp; &quot;quote&quot;')
    expect(email.text).toContain('A <script> & "quote"')
  })

  it('lists each author’s sentences and the way to turn digests off', () => {
    const email = digestEmail(
      'ana@example.com',
      digest({
        additions: new Map([
          [
            'Bob',
            [
              { content: 'One', path: '/s/1' },
              { content: 'Two', path: '/s/2' },
            ],
          ],
          ['Cat', [{ content: 'Three', path: '/s/3' }]],
        ]),
      }),
    )
    expect(email.text).toContain('Bob and Cat added to your stories.')
    expect(
      email.html.match(/href="http:\/\/localhost:3000\/s\/\d"/g),
    ).toHaveLength(3)
    expect(email.html).toContain('href="http://localhost:3000/account"')
    expect(email.html).toMatch(
      /href="http:\/\/localhost:3000" [^>]*>Back to the beginning</,
    )
  })

  it('credits favourites and titles', () => {
    const email = digestEmail(
      'ana@example.com',
      digest({
        favourites: new Map([
          ['Dan', [{ label: 'The Bridge', path: '/s/The_Bridge' }]],
        ]),
        titles: new Map([['Eve', [{ label: 'Waiting', path: '/s/Waiting' }]]]),
      }),
    )
    expect(email.subject).toBe('Your story was favourited!')
    expect(email.text).toContain(
      'Dan favourited your story. Eve titled your story.',
    )
    expect(email.text).toContain('Eve titled:')
    expect(email.html).toContain('href="http://localhost:3000/s/The_Bridge"')
  })

  it('shows the reported sentence', () => {
    const email = reportEmail('admin@example.com', 7, 'Bad words', '/s/7')
    expect(email.subject).toBe('Sentence Reported: 7')
    expect(email.html).toContain('Bad words')
    expect(email.html).toContain('href="http://localhost:3000/s/7"')
  })
})
