import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { start, stop } from './server/lifecycle.ts'
import { withServerTiming } from './server/timing.ts'

export { start, stop }

export default createServerEntry({
  async fetch(request) {
    // Already started in production (server.ts at the root); starts lazily in dev
    await start()
    return withServerTiming(() => handler.fetch(request))
  },
})
