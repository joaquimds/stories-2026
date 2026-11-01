import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgres://stories:stories@localhost:5432/stories_e2e'
export const E2E_SESSION_SECRET = 'e2e-secret-e2e-secret'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Every run starts from the seed data
    command: 'node scripts/seed.ts --reset && pnpm build && node server.js',
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      DATABASE_URL: E2E_DATABASE_URL,
      SESSION_SECRET: E2E_SESSION_SECRET,
      SITE_URL: `http://localhost:${PORT}`,
      EMAIL_FROM: 'noreply@tree.joaqu.im',
      SMTP2GO_API_KEY: '',
    },
  },
})
