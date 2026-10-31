import { createFileRoute } from '@tanstack/react-router'
import { db } from '../server/db/index.ts'
import { resolveStory } from '../server/data/paths.ts'
import { getStory } from '../server/data/stories.ts'
import { renderStoryImage } from '../server/og/image.tsx'

// The share image for a story, by thread or slug
export const Route = createFileRoute('/og/$story')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const database = db()
        const resolved = await resolveStory(database, params.story)
        if (!resolved || resolved.sentenceIds.length < 2) {
          return new Response('Not found', { status: 404 })
        }
        const story = await getStory(database, null, resolved)
        const png = await renderStoryImage({
          title: story.title,
          sentences: story.lines
            .filter((l) => !l.deleted)
            .map((l) => l.content),
        })
        return new Response(new Uint8Array(png), {
          headers: {
            'Content-Type': 'image/png',
            // Stories change slowly; previews needn't be instant
            'Cache-Control':
              'public, max-age=3600, stale-while-revalidate=86400',
          },
        })
      },
    },
  },
})
