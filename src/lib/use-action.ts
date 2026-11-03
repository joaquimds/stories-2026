import { useState } from 'react'
import type { Result } from '../domain/errors.ts'

export const SOMETHING_WENT_WRONG = 'Something went wrong, please try again'

// Runs actions one at a time, showing what is under way and any error, the
// same way wherever people write, link or delete
export const useAction = () => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Runs an action, then shows its error or hands its result to `then`
  const act = async <T extends object>(
    action: () => Promise<Result<T>>,
    then: (result: { ok: true } & T) => Promise<unknown> | void,
  ) => {
    setBusy(true)
    setError(null)
    try {
      const result = await action()
      if (result.ok) {
        await then(result)
      } else {
        setError(result.error)
      }
    } catch {
      setError(SOMETHING_WENT_WRONG)
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, setError, act }
}
