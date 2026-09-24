import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/pages',
  outputDir: 'artifacts/pages-test-results',
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4184/StateBeats/',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'node scripts/serve-player.mjs packages/player/dist 4184 /StateBeats/',
    url: 'http://127.0.0.1:4184/StateBeats/',
    reuseExistingServer: false,
  },
});
