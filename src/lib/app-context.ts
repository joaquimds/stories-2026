import { getAppContext } from '../server/fns/app.ts'

type AppContext = Awaited<ReturnType<typeof getAppContext>>

let cached: AppContext | undefined

// The current user rarely changes without a full page load (login and
// logout reload the page), so the browser asks for it once
export const loadAppContext = async () => {
  if (typeof window === 'undefined') {
    return getAppContext()
  }
  cached ??= await getAppContext()
  return cached
}

export const forgetAppContext = () => {
  cached = undefined
}
