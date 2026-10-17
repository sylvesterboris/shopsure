import { defineConfig, devices } from '@playwright/test';
import type { ReporterDescription } from '@playwright/test';
import { env } from './utils/environment';

// UI specs run in real browsers; API specs need no browser at all.
const UI_SPECS = /tests[\\/](ui[\\/].*|integration[\\/].*\.ui)\.spec\.ts$/;
const API_SPECS = /tests[\\/](api[\\/].*|integration[\\/].*\.api)\.spec\.ts$/;

const reporters: ReporterDescription[] = [
  env.isCI ? ['github'] : ['list'],
  ['html', { outputFolder: 'reports/html', open: 'never' }],
  ['json', { outputFile: 'reports/results.json' }],
];

export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: env.isCI,
  // Retries exist to capture a trace for diagnosis on CI, not to hide flakiness:
  // a test that passes only on retry is reported as "flaky" in the HTML report.
  retries: env.isCI ? 2 : 0,
  workers: env.isCI ? '50%' : undefined,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  reporter: reporters,
  snapshotPathTemplate:
    '{testDir}/__snapshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}',

  use: {
    baseURL: env.baseUrl,
    headless: true,
    testIdAttribute: 'data-testid',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    // Video is costly; keep it only for failures on CI where nobody can watch live.
    video: env.isCI ? 'retain-on-failure' : 'off',
  },

  projects: [
    {
      name: 'api',
      testMatch: API_SPECS,
      use: { extraHTTPHeaders: { Accept: 'application/json' } },
    },
    {
      name: 'chromium',
      testMatch: UI_SPECS,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testMatch: UI_SPECS,
      grepInvert: /@visual/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testMatch: UI_SPECS,
      grepInvert: /@visual/,
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: env.startLocalServer
    ? {
        command: 'npm run app:start',
        url: `${env.baseUrl}/health`,
        reuseExistingServer: !env.isCI,
        timeout: 60_000,
        stdout: 'ignore',
        stderr: 'pipe',
        env: { PORT: String(env.port), NODE_ENV: 'test' },
      }
    : undefined,
});
