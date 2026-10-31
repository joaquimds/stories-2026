// Production entry: start the app (env, migrations, jobs), then serve HTTP
// with Node's own http module: built files from dist/client, everything
// else through the app.
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import app, { start, stop } from './dist/server/server.js'

const PUBLIC_DIR = resolve('dist/client')

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

// A file from dist/client for GET and HEAD requests, if there is one.
// Built assets have hashed names, so they can be cached for good.
const serveFile = async (req, res, pathname) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false
  }
  let path
  try {
    path = join(PUBLIC_DIR, decodeURIComponent(pathname))
  } catch {
    return false
  }
  // Never outside dist/client
  if (!path.startsWith(PUBLIC_DIR + sep)) {
    return false
  }
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) {
    return false
  }
  const etag = `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`
  res.setHeader(
    'Content-Type',
    CONTENT_TYPES[extname(path)] ?? 'application/octet-stream',
  )
  res.setHeader('Content-Length', info.size)
  res.setHeader('ETag', etag)
  res.setHeader(
    'Cache-Control',
    pathname.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600',
  )
  if (req.headers['if-none-match'] === etag) {
    res.statusCode = 304
    res.removeHeader('Content-Length')
    res.end()
    return true
  }
  if (req.method === 'HEAD') {
    res.end()
    return true
  }
  await pipeline(createReadStream(path), res)
  return true
}

// Node's request as a web Request, for the app
const toRequest = (req, url, signal) => {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    for (const item of [value].flat()) {
      if (item !== undefined) {
        headers.append(name, item)
      }
    }
  }
  // Behind Render's proxy this is already set; locally, use the socket
  if (!headers.has('x-forwarded-for') && req.socket.remoteAddress) {
    headers.set('x-forwarded-for', req.socket.remoteAddress)
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? 'half' : undefined,
    signal,
  })
}

// The app's web Response, written back to Node's response
const sendResponse = async (res, response) => {
  res.statusCode = response.status
  for (const [name, value] of response.headers) {
    if (name !== 'set-cookie') {
      res.setHeader(name, value)
    }
  }
  const cookies = response.headers.getSetCookie()
  if (cookies.length) {
    res.setHeader('Set-Cookie', cookies)
  }
  if (!response.body) {
    res.end()
    return
  }
  await pipeline(Readable.fromWeb(response.body), res)
}

await start()

const server = createServer(async (req, res) => {
  // Stops the app's work if the browser goes away
  const aborted = new AbortController()
  res.once('close', () => {
    if (!res.writableFinished) {
      aborted.abort()
    }
  })
  try {
    const url = new URL(
      req.url ?? '/',
      `http://${req.headers.host ?? 'localhost'}`,
    )
    if (await serveFile(req, res, url.pathname)) {
      return
    }
    const response = await app.fetch(toRequest(req, url, aborted.signal))
    await sendResponse(res, response)
  } catch (error) {
    if (aborted.signal.aborted) {
      return
    }
    console.error(error)
    if (!res.headersSent) {
      res.statusCode = 500
      res.end('Internal Server Error')
    } else {
      res.destroy()
    }
  }
})

const port = Number(process.env.PORT ?? 3000)
server.listen(port, () => console.info(`Listening on http://localhost:${port}`))

// Stop taking requests, let open ones finish, then stop jobs and the pool
const shutdown = (signal) => {
  console.info(`${signal} received, shutting down`)
  server.close(async () => {
    await stop()
    process.exit(0)
  })
  server.closeIdleConnections()
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
