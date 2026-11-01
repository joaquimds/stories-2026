import { createFileRoute, redirect } from '@tanstack/react-router'
import { getRandomStory } from '../server/fns/stories.ts'

// Picks a new random story on every visit
export const Route = createFileRoute('/random')({
  loader: async () => {
    const story = await getRandomStory()
    throw story
      ? redirect({ to: '/s/$story', params: { story } })
      : redirect({ to: '/' })
  },
  staleTime: 0,
  gcTime: 0,
})
