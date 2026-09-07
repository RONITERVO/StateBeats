import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/browser',
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
    {
      name: 'firefox',
      testMatch: ['**/conformance.spec.ts', '**/audio.spec.ts'],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testMatch:
        process.platform === 'win32'
          ? ['**/conformance.spec.ts']
          : ['**/conformance.spec.ts', '**/audio.spec.ts'],
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev --workspace @statebeats/player',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
});
