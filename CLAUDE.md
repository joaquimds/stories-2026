# Working on Tree of Tales

See README.md for setup, scripts and layout, and features.md for what has
been built and decided.

## Principles

- **Consistency is key.** The same thing behaves the same way everywhere.
  Share one implementation rather than writing a second that is "close
  enough": for example, continuations are ranked by one function
  (`popularityScores` in `src/server/data/rules.ts`) on both the story page
  and the map, with a test holding them together. When something new
  resembles something existing, reuse it or make them match, and say so.
- **Exploration and discovery.** The site doesn't explain itself on its
  pages: no legends, hints or "how it works" text. Answers belong in the
  FAQ (`src/routes/faq.tsx`). Add an FAQ entry with any feature that needs
  explaining.
- **Few dependencies.** Prefer a small amount of our own code to a library;
  reach for one only when it does something we shouldn't (drawing PNGs with
  resvg, physics with d3-force), and say what it is for.

## Copy

- Sentence case everywhere, including headings, labels, buttons, page
  titles and email subjects; never Title Case.
- "Log in" (verb) and "log out", never "Login".
- A piece of writing is a "fragment" in anything people read (code can
  still say sentence).
- Parentheses are the site's quiet narrator voice: lowercase asides that
  stand in where content is missing ("(no results)", "(reported)", "(tale's
  end; …)", "(the beginning)" for the root), gentle links ("(back to the
  story)", "(previous)", "(next)") and small notes. One clause each; join
  clauses with a semicolon. Procedural messages, such as "Please check your
  email for further instructions.", are plain sentences.
- Errors people can meet in normal use are friendly ("Wrong email or
  password", "Something went wrong, please try again"); errors only reachable
  by getting round the interface can stay technical ("Forbidden").
- No explanatory hints on pages (see Exploration above). The exceptions:
  the login page's note that you'll be taken back to your story, the note
  where a Popular list stops at the top 100, and the notifications hint
  beside both notification checkboxes (one shared `NOTIFICATIONS_HINT`),
  because what people are signing up to by email is sensitive.

## Database

`src/server/db/types.ts` describes the tables for Kysely and is kept by
hand: update it in the same change as any migration.

## Checks

`pnpm check` (typecheck, lint, unit and data tests) and `pnpm test:e2e`
before pushing. Both need Postgres; see the README.

## Git

Commit and push straight to `main`; no branches or pull requests.
