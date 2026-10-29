import { isThread } from './thread.ts'

export const MAX_TITLE_LENGTH = 100

export const titleToSlug = (title: string) =>
  title
    .trim()
    .replace(/[\s/?#%\\]+/g, '_')
    .replace(/^_+|_+$/g, '')

// Returns an error message, or null when the title is acceptable
export const validateTitle = (title: string): string | null => {
  const trimmed = title.trim()
  if (!trimmed) {
    return 'Title is required'
  }
  if (trimmed.length > MAX_TITLE_LENGTH) {
    return `Titles can be at most ${MAX_TITLE_LENGTH} characters`
  }
  const slug = titleToSlug(trimmed)
  if (!slug || isThread(slug)) {
    return 'Titles must contain some words'
  }
  return null
}
