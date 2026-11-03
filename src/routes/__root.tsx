import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  type ErrorComponentProps,
  createRootRoute,
  useRouteContext,
  useRouterState,
} from '@tanstack/react-router'
import { type ReactNode, useEffect } from 'react'
import { Footer } from '../components/Footer.tsx'
import { Navbar } from '../components/Navbar.tsx'
import { PendingBar } from '../components/PendingBar.tsx'
import { loadAppContext } from '../lib/app-context.ts'
import { SITE_DESCRIPTION, SITE_TITLE } from '../lib/site.ts'
import appCss from '../styles/global.css?url'

// Routes whose pages scroll as a whole rather than within their content
const SCROLLING = ['/login', '/reset', '/faq', '/stats']

export const Route = createRootRoute({
  beforeLoad: () => loadAppContext(),
  loader: ({ context }) => ({ siteUrl: context.siteUrl }),
  head: ({ loaderData }) => {
    const shareImage = `${loaderData?.siteUrl ?? ''}/tree.jpg`
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'initial-scale=1.0, width=device-width' },
        { title: SITE_TITLE },
        { name: 'description', content: SITE_DESCRIPTION },
        { property: 'og:title', content: SITE_TITLE },
        { property: 'og:description', content: SITE_DESCRIPTION },
        { property: 'og:image', content: shareImage },
        { property: 'og:image:width', content: '512' },
        { property: 'og:image:height', content: '512' },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: loaderData?.siteUrl },
        { name: 'twitter:title', content: SITE_TITLE },
        { name: 'twitter:description', content: SITE_DESCRIPTION },
        { name: 'twitter:image', content: shareImage },
        { name: 'twitter:card', content: 'summary' },
      ],
      links: [
        { rel: 'stylesheet', href: appCss },
        { rel: 'icon', href: '/favicon.ico' },
      ],
    }
  },
  component: RootComponent,
  notFoundComponent: () => <Message>Not found</Message>,
  errorComponent: ErrorScreen,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  const { user } = useRouteContext({ from: '__root__' })
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <PendingBar />
        <div
          className={`root ${SCROLLING.some((path) => pathname.startsWith(path)) ? 'scroll' : ''}`}
        >
          <Navbar user={user} />
          <main className="main">{children}</main>
          <Footer />
        </div>
        <Scripts />
      </body>
    </html>
  )
}

// A page's code that failed to load, as browsers word it; the router's own
// check (isModuleNotFoundError, not exported to apps) uses the same three
const isMissingCode = (error: unknown): error is Error =>
  error instanceof Error &&
  [
    'Failed to fetch dynamically imported module',
    'error loading dynamically imported module',
    'Importing a module script failed',
  ].some((message) => error.message.startsWith(message))

// The router's own note, in this tab, that it has reloaded for an error
const reloadKey = (error: Error) => `tanstack_router_reload:${error.message}`

// Whether to reload the page for this error: a tab opened before a deploy
// asking for a page's code that is no longer there, which loading the page
// afresh mends. Only once per tab, sharing the router's note so the two
// never both reload; after that, or without storage, the error shows.
const shouldReload = (error: unknown): error is Error => {
  if (typeof window === 'undefined' || !isMissingCode(error)) {
    return false
  }
  try {
    return !window.sessionStorage.getItem(reloadKey(error))
  } catch {
    return false
  }
}

// Set once a reload is under way, so nothing shows while the page goes
let reloading = false

// Shows what went wrong, except for the moment a reload mends it
function ErrorScreen({ error }: ErrorComponentProps) {
  const reload = reloading || shouldReload(error)
  useEffect(() => {
    console.error(error)
    if (!reloading && shouldReload(error)) {
      reloading = true
      window.sessionStorage.setItem(reloadKey(error), '1')
      window.location.reload()
    }
  }, [error])
  return reload ? null : <Message>Something went wrong</Message>
}

function Message({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: 'auto', textAlign: 'center' }}>
      {children}
      <br />
      <Link to="/">(back to the beginning)</Link>
    </p>
  )
}
