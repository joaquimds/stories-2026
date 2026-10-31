// Unsent sentences, kept in this browser per story so they survive leaving
// the page, or logging in to publish them. Storage may be unavailable
// (private windows, blocked site data), so every access is guarded.
const key = (story: string) => `draft:${story}`

export const loadDraft = (story: string) => {
  try {
    return window.localStorage.getItem(key(story)) ?? ''
  } catch {
    return ''
  }
}

export const saveDraft = (story: string, content: string) => {
  try {
    if (content) {
      window.localStorage.setItem(key(story), content)
    } else {
      window.localStorage.removeItem(key(story))
    }
  } catch {
    // Drafts are a convenience; nothing to do
  }
}

// Only same-site paths, so a crafted link can't send people elsewhere
export const safeNext = (next: unknown) =>
  typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
    ? next
    : '/'
