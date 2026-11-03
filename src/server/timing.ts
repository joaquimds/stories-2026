import { AsyncLocalStorage } from 'node:async_hooks'

// How long a request spends on the database, for the Server-Timing header:
// every query run while handling the request adds to its tally
type Tally = { started: number; queries: number; dbMs: number }

const tallies = new AsyncLocalStorage<Tally>()

export const countQuery = (durationMs: number) => {
  const tally = tallies.getStore()
  if (tally) {
    tally.queries++
    tally.dbMs += durationMs
  }
}

// Handles a request, then reports its total time, its time on the
// database (summed, so parallel queries can add up to more than the total)
// and how many queries it ran. For a streamed page, the total is the time
// to its first byte.
export const withServerTiming = async (
  handle: () => Response | Promise<Response>,
): Promise<Response> => {
  const tally: Tally = { started: performance.now(), queries: 0, dbMs: 0 }
  const response = await tallies.run(tally, async () => handle())
  const total = performance.now() - tally.started
  const value = [
    `total;dur=${total.toFixed(1)}`,
    `db;dur=${tally.dbMs.toFixed(1)};desc="${tally.queries} ${tally.queries === 1 ? 'query' : 'queries'}"`,
  ].join(', ')
  try {
    response.headers.append('Server-Timing', value)
    return response
  } catch {
    // Some responses' headers can't be changed; copy them
    const copy = new Response(response.body, response)
    copy.headers.append('Server-Timing', value)
    return copy
  }
}
