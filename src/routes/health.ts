import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'kysely'
import { db } from '../server/db/index.ts'

export const Route = createFileRoute('/health')({
  server: {
    handlers: {
      GET: async () => {
        await sql`select 1`.execute(db())
        return new Response('ok', { headers: { 'Cache-Control': 'no-store' } })
      },
    },
  },
})
