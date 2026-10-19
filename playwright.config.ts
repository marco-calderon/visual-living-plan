import { defineConfig, devices } from '@playwright/test'

const desktop = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1440, height: 900 },
}

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:9478',
    ...desktop,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'E2E_PORT=9478 E2E_MODE=watch bun scripts/e2e-server.ts',
      url: 'http://127.0.0.1:9478',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'E2E_PORT=9479 E2E_MODE=review bun scripts/e2e-server.ts',
      url: 'http://127.0.0.1:9479',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
