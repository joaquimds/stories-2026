import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/data/**/*.test.ts'],
    globalSetup: ['tests/data/global-setup.ts'],
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgres://stories:stories@localhost:5432/stories_test',
      SESSION_SECRET: 'test-secret-test-secret',
      SITE_URL: 'http://localhost:3000',
      EMAIL_FROM: 'noreply@tree.joaqu.im',
      ADMIN_EMAIL: 'admin@example.com',
    },
    fileParallelism: false,
  },
})
