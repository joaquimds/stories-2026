import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.url(),
  SESSION_SECRET: z.string().min(16),
  SITE_URL: z.url().transform((url) => url.replace(/\/$/, '')),
  SMTP2GO_API_KEY: z.string().optional(),
  EMAIL_FROM: z.email().default('noreply@tree.joaqu.im'),
  ADMIN_EMAIL: z.preprocess((v) => v || undefined, z.email().optional()),
  PORT: z.coerce.number().int().default(3000),
})

export type Env = z.infer<typeof schema>

let parsed: Env | undefined

export const env = (): Env => {
  if (!parsed) {
    const result = schema.safeParse(process.env)
    if (!result.success) {
      throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`)
    }
    parsed = result.data
  }
  return parsed
}
