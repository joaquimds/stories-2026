import { useRouterState } from '@tanstack/react-router'

// The router's pending state, in place of nprogress
export const PendingBar = () => {
  const pending = useRouterState({ select: (s) => s.status === 'pending' })
  return pending ? (
    <div className="pending-bar" role="progressbar" aria-label="Loading" />
  ) : null
}
