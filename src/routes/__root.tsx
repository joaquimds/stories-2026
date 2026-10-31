import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouteContext,
  useRouterState,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Footer } from '../components/Footer.tsx'
import { Navbar } from '../components/Navbar.tsx'
import { PendingBar } from '../components/PendingBar.tsx'
import { loadAppContext } from '../lib/app-context.ts'
import { SITE_DESCRIPTION, SITE_TITLE } from '../lib/site.ts'
import appCss from '../styles/global.css?url'

// Routes whose pages scroll as a whole rather than within their content
const SCROLLING = ['/login', '/reset', '/faq', '/stats', '/read/']

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
  notFoundComponent: () => <Message>Not Found</Message>,
  errorComponent: () => <Message>Something went wrong</Message>,
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

function Message({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: 'auto', textAlign: 'center' }}>
      {children}
      <br />
      <Link to="/">(back to the beginning)</Link>
    </p>
  )
}
