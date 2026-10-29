import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { start, stop } from './server/lifecycle.ts'

export { start, stop }

export default createServerEntry({
  async fetch(request) {
    // Already started in production (server.js); starts lazily in dev
    await start()
    return handler.fetch(request)
  },
})
