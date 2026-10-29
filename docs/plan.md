# Tree of Tales — rebuild plan

_A garden of forking paths._ Collaborative, non-linear fiction: people write
sentences that continue other sentences, and link sentences into other
stories, forming a graph. A story is a path through that graph.

This is a from-scratch rebuild of `~/Projects/stories` (Next 9, Apollo,
Objection, Express, Redis, 2020) as the app we would build today. There is no
legacy data to migrate and no URL compatibility to preserve. Product
behaviour, copy and branding carry over unchanged unless noted.

## 1. Decisions

| Area | Decision |
|---|---|
| Language | TypeScript, `strict` |
| Runtime | Node 26 (current LTS), pinned via `.nvmrc` + `engines` |
| Framework | TanStack Start (TanStack Router, Vite), React 19 |
| Data access | Route loaders + server functions only. No client data library. |
| Database | Supabase Postgres (free tier), Kysely, `kysely-codegen`, Kysely migrator |
| Background work | pg-boss, worker in the web server process; schedules via `boss.schedule()` |
| Auth | Hand-rolled: sessions table, httpOnly cookie, bcrypt hashes |
| Email | SMTP2GO HTTP API via `fetch`, from `noreply@stories.joaqu.im` |
| Styling | Plain CSS: global stylesheet + CSS Modules, custom properties, native nesting |
| Validation | Zod for env, search params and every server function input |
| Testing | Vitest against a real Postgres; Playwright end-to-end |
| Tooling | pnpm, ESLint (flat config) + Prettier |
| Hosting | Render free web service, kept awake by UptimeRobot; domain `stories.joaqu.im` |
| Analytics | None. A public `/stats` page instead. |
| Cost | Zero. No `render.yaml`, no extra services. |

Not carried over: Next.js, Express, Apollo, GraphQL, dataloader, Objection,
knex, Passport, express-session, Redis, Babel, Sass, nodemon, dotenv,
nodemailer, winston, wdio, prop-types, nprogress, commander, Google Analytics,
the `points` and `notifications` tables, and the sentinel sentence `0`.

## 2. Infrastructure

### Render (free web service)
- Build: `pnpm install --frozen-lockfile && pnpm build`. Start: `pnpm start`
  (TanStack Start's Node server output).
- Startup sequence in one process: validate env → run Kysely migrations
  (the migrator takes a lock, so deploy overlap is safe) → start pg-boss and
  register workers and schedules → start serving HTTP.
- `SIGTERM` (deploys, restarts): stop accepting requests, `boss.stop({ graceful: true })`,
  destroy the Kysely pool.
- `GET /health` returns 200 after a trivial DB query. UptimeRobot pings it
  every 5 minutes to keep the free instance from sleeping. One always-on
  service is ~744 h/month, within Render's 750 free hours as long as nothing
  else in the workspace uses them.
- Free services block outbound SMTP ports, so email goes over HTTPS.
- Custom domain `stories.joaqu.im` configured in the Render dashboard.

### Supabase (free Postgres)
- Connect via the **shared pooler in session mode** (port 5432, user
  `postgres.<project-ref>`). The direct connection is IPv6-only and
  unreachable from Render; transaction mode breaks prepared statements.
- Small pools: Kysely `max: 5`, pg-boss `max: 3`, to stay well inside the
  free-tier connection limits.
- **Disable the Data API** in project settings, and keep all app tables in an
  `app` schema (not exposed even if the API is re-enabled), so password
  hashes and sessions can never be read via the public anon key. pg-boss uses
  its own `pgboss` schema.
- pg-boss's polling keeps the project active, so it isn't paused for
  inactivity.

### Local development
- `compose.yaml` with a single Postgres 17 container (dev and test databases).
- `.env` (gitignored) and `.env.example`; Node's `--env-file` for scripts.

### Environment variables
| Name | Purpose |
|---|---|
| `DATABASE_URL` | Supabase session-pooler URL (or local) |
| `SESSION_SECRET` | Pepper for hashing session and reset tokens |
| `SITE_URL` | `https://stories.joaqu.im` (links in emails, OG tags) |
| `SMTP2GO_API_KEY` | Email; if unset, emails are logged instead of sent |
| `EMAIL_FROM` | `noreply@stories.joaqu.im` |
| `ADMIN_EMAIL` | Report notifications; optional |
| `PORT` | Set by Render |

SMTP2GO needs `stories.joaqu.im` verified as a sender domain (DNS records on
the subdomain).

## 3. Data model

All tables live in schema `app`. IDs are `bigint generated always as identity`,
parsed to `number` by the pg driver. Timestamps are `timestamptz default now()`.
Extensions: `citext`, `pg_trgm`.

```sql
users (
  id, email citext unique not null, name citext unique not null,
  password_hash text not null, is_notifiable boolean not null default true,
  last_notified_at timestamptz not null default now(), created_at
)

sessions (
  id text primary key,                 -- sha256(token + SESSION_SECRET)
  user_id references users on delete cascade, expires_at, created_at
)

password_reset_tokens (
  token_hash text primary key, user_id references users on delete cascade,
  expires_at, created_at
)

sentences (
  id, content text not null check (char_length(content) between 1 and 280),
  author_id references users,
  written_under_path_id references paths,   -- null = a beginning
  deleted_at timestamptz, created_at
)

links (
  id, from_sentence_id references sentences, to_sentence_id references sentences,
  author_id references users null,          -- null = system (written-under or delete relink)
  created_at, unique (from_sentence_id, to_sentence_id)
)

paths (
  id, parent_id references paths on delete cascade null,  -- null = a beginning
  sentence_id references sentences on delete cascade, created_at,
  unique nulls not distinct (parent_id, sentence_id)
)

likes (user_id references users, path_id references paths on delete cascade,
       created_at, primary key (user_id, path_id))

titles (path_id primary key references paths on delete cascade,
        title text not null, slug text unique not null,
        author_id references users, created_at)

reports (id, sentence_id references sentences on delete cascade,
         reporter_id references users null, created_at)
```

Indexes: `paths (parent_id)`, `paths (sentence_id)`, `links (to_sentence_id)`,
`sentences (author_id)`, `likes (path_id)`, trigram GIN indexes on
`sentences.content` and `titles.title`.

### Paths
- `paths` is a trie: each row is its parent path plus one sentence. Loops in
  the sentence graph are just distinct nodes in the trie.
- A row exists only for paths something is attached to:
  - writing a sentence creates its **origin path** (`parent_id =
    written_under_path_id`, `sentence_id = sentence.id`);
  - linking, liking and titling call `ensurePath`, which upserts the path and
    any missing ancestors inside the action's transaction.
- Reading never creates rows. Any path is readable from its thread string;
  its children come from `links`.
- Subtrees are walked with recursive CTEs on `parent_id`.

### Contributions (view)
`app.contributions (user_id, path_id, kind, created_at)` =
- `write`: authored, non-deleted sentences, at their origin path;
- `like`: likes;
- `title`: titles (counts for editability and link protection only, not
  ranking).

All "points" logic from the old app becomes queries over this view.

## 4. Threads (`src/domain/thread.ts`)

The public name for any path, used in URLs.

- **Default parent** of a sentence = the sentence of its
  `written_under_path_id` (none for beginnings). Defaults always point to
  older sentences, so walking back always terminates.
- **Encoding**: the leaf sentence id, followed by the non-default steps taken
  while walking back towards the beginning, in leaf-to-root order. Each step is
  `from-to`: "at sentence `from`, go back to `to` instead of the default
  parent". Steps are separated by `.`: e.g. `12.5-3`.
  Characters `.` and `-` never get percent-encoded.
- `decodeThread(str) → sentenceIds[]` (root → leaf), validating every step
  against `links` and default parents; invalid threads 404.
- `encodeThread(sentenceIds[]) → str`.
- `resolvePath(sentenceIds[]) → { sentenceIds, pathId | null }`.
- `ensurePath(trx, sentenceIds[]) → pathId`.
- Unit tests: round trips, loops (same sentence visited repeatedly), invalid
  steps, beginnings reached through links.

Story URLs are `/s/<thread>` or `/s/<slug>` for titled stories (§8).

## 5. Rules (derived, replacing `points`)

| Rule | Definition |
|---|---|
| Children of a path | Sentences linked from its leaf sentence, excluding deleted sentences |
| **Popular** order | 1) distinct users with `write`/`like` contributions in the subtree of `path + child`; 2) distinct such users under any path ending at the child sentence; 3) oldest first |
| **Newest / Oldest** | By sentence id (children) or path/title id (lists) |
| Library **Popular** | Number of likes on the titled path |
| Editable in place | Nobody other than the sentence's author has a `write`, `like` or `title` contribution at or below any path ending at the sentence |
| Link protected | A non-default step `from-to` in a story may be unlinked by its link author only if no one has a `write` or `title`, and no one other than the link author has a `like`, at or below paths that take that step |
| Digest recipients | For each notifiable user: sentences by other users, created since their `last_notified_at`, whose origin path passes through a sentence the user wrote |

Ranking computes scores for all children; `LIMIT` only trims output. If this
gets slow, a score cache refreshed by a pg-boss job can sit behind the same
function later.

## 6. Pagination

"Previous / Next" page links everywhere. **10 items per page.** All state is
in validated search params; route loaders fetch exactly one window. Pages are
server-rendered, shareable, and work with back/forward and without JS.

- **Popular**: `?page=1..10` → `OFFSET (page-1)*10 LIMIT 10` within the top
  100. The last page says "showing the top 100 — sort by newest or search to
  find more".
- **Newest / Oldest** and all id-ordered lists: keyset paging with
  `?after=<id>` / `?before=<id>` (`before` runs the reversed query and
  reverses the results).

```ts
type PageParams =
  | { order: 'popular'; page?: number }
  | { order: 'newest' | 'oldest'; after?: number; before?: number }

type Page<T> = { items: T[]; prev: PageParams | null; next: PageParams | null }
```

One Zod schema for `PageParams`, one `<Pager>` component rendering `prev` and
`next` as `<Link>`s. The story page has two lists, so the link browser's
params are prefixed (`l.dir`, `l.q`, `l.after`, …).

## 7. Server layout

```
src/
  domain/          thread codec, pure types and rules (no I/O)
  server/
    db/            kysely instance, generated types, migrations/
    data/          stories, sentences, links, likes, titles, users, reports, stats
    auth/          sessions, passwords, reset tokens, middleware, rate limit
    jobs/          boss.ts (start/stop), send-email, notification-digest, report-email
    email/         smtp2go client, templates (plain text + minimal HTML)
    fns/           createServerFn wrappers (validation + auth) over data/
  routes/          TanStack Router file routes
  components/      React components + *.module.css
  styles/          global.css (reset, typography, buttons, forms, tokens)
scripts/           seed.ts
```

- `data/` functions take a Kysely instance or transaction and return
  view-ready shapes. Related data (authors, permalinks, editable flags) is
  fetched in batched queries.
- Every write runs in one transaction. Jobs are enqueued inside the same
  transaction where they depend on the write.
- `[deleted]` masking happens in `data/`.
- Server functions are public endpoints: each validates input with Zod and
  checks auth itself.

## 8. Routes

| Route | Contents |
|---|---|
| `__root` | Document, `head()` defaults (title, description, OG/Twitter tags, share image), global CSS, self-hosted EB Garamond via `@fontsource`, navbar, footer, current user in router context |
| `/` | Beginnings (the root of the tree): children list + Write panel |
| `/s/$story` | A thread or a slug. Loader decodes it (404 if invalid); `head()` sets title/description/canonical (slug if titled). Story text, actions, children list, Write panel |
| `/library` | Titled stories: search, Popular/Newest/Oldest |
| `/account` | Layout; `beforeLoad` redirects to `/login` when signed out |
| `/account/` | Settings (notifications on/off), logout |
| `/account/fragments` | Sentences I wrote |
| `/account/links` | Links I made |
| `/account/favourites` | Stories I liked |
| `/login` | Login, register, forgot password |
| `/reset` | Reset password (token read from `#fragment` on the client) |
| `/faq` | Existing copy |
| `/stats` | Public stats (§11) |
| `/health` | Server route for UptimeRobot |

Writes are server functions followed by `router.invalidate()` or navigation to
the new thread. Pending states use the router's pending UI rather than
nprogress.

## 9. Actions (server functions)

Stories:
- **write**: content trimmed, 1–280 chars → sentence + system link from the
  parent + origin path; enqueue nothing (the digest picks it up). Navigate to
  the new thread.
- **link**: link an existing sentence as a child of the current leaf. If the
  link already exists, just navigate. Creates the path for the new step.
- **edit**: if the user wrote the sentence and it is editable, edit in place.
  Otherwise create a new branch: a new sentence under the same parent path,
  with copies of the original's outgoing links, then navigate to the
  equivalent of the rest of the story through the new sentence.
- **delete** (author only): no children → hard delete (cascades paths,
  likes, titles). Has children → set `deleted_at` (shown as `[deleted]`) and
  add system links from each of its parents to each of its children, so
  readers skip past it.
- **unlink** (link author only): only the final non-default step of the
  current story, only if not protected (§5). Deletes the link and the paths
  taking that step (cascade).
- **like / unlike**: ensures the path; toggles the like.
- **title**: only the author of the story's final sentence. Rejects titles
  that look like a thread. Slug must be unique; replaces any existing title
  on that path.
- **report**: stores a report; enqueues the admin email if `ADMIN_EMAIL` is
  set.

Auth: register, login, logout, request password reset, reset password,
update settings.

## 10. Auth

- Token = 32 random bytes, base64url, in an `httpOnly`, `Secure`,
  `SameSite=Lax` cookie; only its hash is stored. 30-day sliding expiry.
- Passwords: `bcryptjs`.
- Reset: hashed single-use token, 1-hour expiry, emailed as
  `/reset#<token>`; reset invalidates the user's other sessions.
- Request middleware resolves the user once per request; `requireUser()` for
  writes and account routes.
- Rate limiting (Postgres-backed fixed windows, keyed by IP and email) on
  login, register, forgot password and report.
- No email verification and no account deletion (as before).

## 11. Jobs (pg-boss)

| Queue | Trigger | Work |
|---|---|---|
| `send-email` | Enqueued by other jobs and actions | POST to SMTP2GO; retries with backoff |
| `notification-digest` | `boss.schedule()` daily at 18:00 `Europe/London` | Fix a cutoff; for each recipient (§5) build the grouped digest ("Read what X wrote here and here…"), enqueue `send-email` and set `last_notified_at = cutoff` in one transaction |
| `report-email` | Report action | Email `ADMIN_EMAIL` with a link to the sentence |

Emails include the account-page link to turn digests off, as before.

## 12. Stats page (`/stats`)

Plain numbers and tables, at most a strip of CSS bars; no chart library.
Computed live, cached in memory for a few minutes.

- Totals: sentences, writers, likes, titled stories
- Sentences written in the last 7 and 30 days
- The longest story (deepest path)
- The most-branched sentence (most children)
- The most-liked story
- Number of loops in the graph

## 13. Styling

- Port the existing look exactly: EB Garamond, the current spacing,
  typography, buttons, forms and layout.
- Sass variables → custom properties on `:root`; `spacing()` → a scale of
  custom properties; the few mixins inlined.
- Global CSS for reset, typography, buttons and forms; a CSS Module per
  component.
- Assets carried over: `tree.svg`, `tree.jpg` (share image), `favicon.ico`.

## 14. Testing

- **Unit**: thread codec, pagination params, slug rules.
- **Data layer** (Vitest, real Postgres, each test in a rolled-back
  transaction): every rule in §5, every action in §9, ordering and paging,
  delete-with-children relinking, unlink cascades, digest recipient
  selection.
- **End-to-end** (Playwright against a seeded DB): read and navigate, write,
  link, like, title, edit (in place and branch), delete, unlink, register,
  login, reset password, account lists, stats.
- CI is optional; `pnpm check` runs typecheck, lint and tests locally.

## 15. Order of work

1. **Scaffold**: TanStack Start + TS, pnpm, ESLint/Prettier, `compose.yaml`,
   env validation, `/health`, startup/shutdown sequence.
2. **Schema**: migrations (`app` schema, extensions, tables, view), codegen,
   seed script.
3. **Thread codec and paths**, with tests.
4. **Data layer reads**: story page, children (all orders), lists, link
   candidates, stats, with tests.
5. **Data layer writes**: all actions with transactions, with tests.
6. **Auth** and rate limiting.
7. **Jobs and email**: pg-boss lifecycle, SMTP2GO client, digest, reports.
8. **UI**: root layout and global styles, story page, Write panel, library,
   account, login/reset, FAQ, stats.
9. **End-to-end tests.**
10. **Deploy**: Supabase project (Data API off, pooler URL), Render service,
    SMTP2GO domain, DNS for `stories.joaqu.im`, UptimeRobot.

## 16. Postponed

- Admin role and moderation UI (reports are stored and emailed meanwhile).
- Score cache for Popular ordering (only if it gets slow).
- Search within a story's children list (if any sentence gets many children).
