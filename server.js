// Production entry: start the app (env, migrations, jobs), then serve HTTP.
import { serve } from 'srvx'
import { staticMiddleware } from 'srvx/static'
import app, { start, stop } from './dist/server/server.js'

await start()

const assets = staticMiddleware({
  dir: 'dist/client',
  maxAge: 60 * 60 * 24 * 365,
  immutable: true,
})
const files = staticMiddleware({ dir: 'dist/client', maxAge: 60 * 60 })

const server = serve({
  port: Number(process.env.PORT ?? 3000),
  gracefulShutdown: false,
  middleware: [
    (request, next) =>
      new URL(request.url).pathname.startsWith('/assets/')
        ? assets(request, next)
        : files(request, next),
  ],
  fetch: app.fetch,
})
await server.ready()

const shutdown = async (signal) => {
  console.info(`${signal} received, shutting down`)
  await server.close()
  await stop()
  process.exit(0)
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
