# Tree of Tales

_A garden of forking paths._ Collaborative, non-linear fiction: people write
sentences that continue other sentences, and link sentences into other
stories, forming a graph. A story is a path through that graph.

See [docs/plan.md](docs/plan.md) for the design.

## Development

Requires Node 26 (`.nvmrc`), pnpm 10 and Postgres 15+.

```bash
pnpm install
```

```bash
docker compose up -d
```

```bash
cp .env.example .env
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

The app runs at http://localhost:3000. The dev server runs migrations and
starts pg-boss on the first request. Seeded accounts (`ana@example.com`,
`bob@example.com`, `cat@example.com`) use the password `password`.

Without `SMTP2GO_API_KEY`, emails (password resets, digests, reports) are
printed to the console instead of sent.

### Scripts

| Script                      |                                                              |
| --------------------------- | ------------------------------------------------------------ |
| `pnpm dev`                  | Dev server with HMR                                          |
| `pnpm build` / `pnpm start` | Production build and server (`server.js`)                    |
| `pnpm db:migrate`           | Run migrations against `DATABASE_URL`                        |
| `pnpm db:codegen`           | Regenerate `src/server/db/types.ts` from the database        |
| `pnpm db:seed`              | Seed an empty database (`-- --reset` drops it first)         |
| `pnpm check`                | Typecheck, lint and unit/data tests                          |
| `pnpm test`                 | Unit and data-layer tests (uses the `stories_test` database) |
| `pnpm test:e2e`             | Playwright tests (uses the `stories_e2e` database)           |

The data-layer tests drop and recreate the `app` and `pgboss` schemas in
`stories_test` (override with `TEST_DATABASE_URL`). The end-to-end tests
reseed `stories_e2e` (override with `E2E_DATABASE_URL`), build the app and
serve it on port 3100. The compose file creates both databases.

### Layout

```
src/
  domain/          thread codec, pagination, slugs, search params (no I/O)
  server/
    db/            Kysely instance, generated types, migrations
    data/          queries and actions, taking a Kysely instance or transaction
    auth/          sessions, passwords, tokens, rate limits, request helpers
    jobs/          pg-boss lifecycle and workers
    email/         SMTP2GO client and templates
    fns/           server functions: validation and auth over data/
    lifecycle.ts   startup (env → migrations → pg-boss) and shutdown
  server.ts        Start server entry; exports start/stop for server.js
  routes/          TanStack Router file routes
  components/      React components with CSS Modules
  styles/          global.css
server.js          production HTTP server (srvx), SIGTERM handling
scripts/           migrate, seed
tests/data/        Vitest against Postgres, each test in a rolled-back transaction
tests/e2e/         Playwright
```

## Deployment

Free tiers only: Supabase Postgres, a Render web service, SMTP2GO and
UptimeRobot.

1. **Supabase**: create a project. In project settings, disable the Data
   API. Copy the **session pooler** connection string (port 5432, user
   `postgres.<project-ref>`) and append `?sslmode=require&uselibpqcompat=true`
   (encrypted, with libpq's meaning of `require`). The direct connection is
   IPv6-only and transaction mode breaks prepared statements.
2. **SMTP2GO**: verify `stories.joaqu.im` as a sender domain (add its DNS
   records) and create an API key that can send email.
3. **Render**: create a free web service from this repository.
   - Build command: `pnpm install --frozen-lockfile && pnpm build`
   - Start command: `pnpm start`
   - Health check path: `/health`
   - Environment: `DATABASE_URL`, `SESSION_SECRET` (a long random string),
     `SITE_URL=https://stories.joaqu.im`, `SMTP2GO_API_KEY`,
     `EMAIL_FROM=noreply@stories.joaqu.im`, optionally `ADMIN_EMAIL`, and
     `NODE_VERSION=26`.
   - Add the custom domain `stories.joaqu.im` and its CNAME record.
4. **UptimeRobot**: an HTTP monitor on `https://stories.joaqu.im/health`
   every 5 minutes keeps the free instance awake.

Each start runs pending migrations (under Kysely's migration lock), starts
pg-boss with its workers and the daily 18:00 Europe/London digest schedule,
then serves HTTP. `SIGTERM` stops accepting requests, lets running jobs
finish, and closes the pool.

## Decisions made while building

Where the plan left room, or where building it surfaced something:

- **TypeScript 6.0**, not 7: typescript-eslint does not support 7 yet.
- **Beginnings and the link browser**: the old sentinel sentence `0` was the
  parent of every beginning. Its role is kept in two places: the home page
  also lists the children of deleted beginnings (reached through them), and
  the link browser treats beginnings as siblings of each other.
- **Rate limits** live in an extra `rate_limits` table (fixed windows).
  Login and password-reset attempts count even when they fail.
- **Forgotten passwords** always report success, so the form doesn't reveal
  which emails have accounts. Passwords need at least 8 characters.
- **Favourites** are ordered by when they were liked; the like's path id is
  the page cursor, since likes have no id of their own.
- **Loops** on the stats page count independent cycles in the sentence graph
  (per strongly connected component: links − sentences + 1).
- The footer links to `/stats`.
- The FAQ's example link pointed at a story in the old database; it now
  points to the home page.
- The current user is resolved once per request (memoised on the request)
  rather than in a separate middleware.
