import { createServerFn } from '@tanstack/react-start'
import { currentUser } from '../auth/request.ts'
import { env } from '../env.ts'

export const getAppContext = createServerFn({ method: 'GET' }).handler(
  async () => ({
    user: await currentUser(),
    siteUrl: env().SITE_URL,
  }),
)
