# Flaky tests: causes and how this framework avoids them

| Common cause                                                                  | What this framework does                                                                                                                                                                  |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixed sleeps (`waitForTimeout`) that are too short on CI and too long locally | None are used. ESLint (`playwright/no-wait-for-timeout`) fails the build if one is added. Web-first assertions (`await expect(locator).toHaveText(...)`) retry until the condition holds. |
| Asserting before client-side rendering finishes                               | `ProductsPage.waitForLoad()` waits for a visible signal (the result count replacing "Loading products…") rather than for time or network idle.                                            |
| Shared test data (two tests using the same cart or user)                      | Each test registers its own user via the API. Seed products are read-only; temporary products are created and deleted per test.                                                           |
| Order-dependent tests                                                         | No test relies on state from another. `fullyParallel: true` runs tests in any order.                                                                                                      |
| Brittle selectors (CSS classes, XPath, nth-child)                             | Locators use roles, labels and `data-testid`. One exception: the hidden checkout token input, which has no role or label, is located by `name` inside `CheckoutPage`.                     |
| Ambiguous locators matching two elements                                      | Strict mode is on (Playwright default). During development this caught `getByLabel('Quantity for X')` also matching the "Update quantity for X" button; the fix was `exact: true`.        |
| Leftover data from earlier runs                                               | Unique identifiers include a run id, worker index and per-test hash.                                                                                                                      |
| Timing of in-flight UI states                                                 | The "button disabled while submitting" test cancels the navigation instead of racing it, because Playwright locators intentionally wait for pending navigations.                          |
| Animations in screenshots                                                     | `toHaveScreenshot` uses `animations: 'disabled'` and a small `maxDiffPixelRatio`. Visual tests are limited to stable components and run only on Chromium.                                 |
| External dependencies (third-party demo sites, real networks)                 | The target is a local app started by Playwright. Network failure scenarios are simulated with `page.route`.                                                                               |

## How retries are used

`retries: 2` on CI only, and `trace: 'on-first-retry'`. Retries exist to **capture a trace**
of an intermittent failure, not to turn a red build green: a test that passes on retry is reported
as _flaky_ in the HTML report and listed separately by `npm run summary`.

## Investigating a flaky test

1. Open the HTML report (`npm run report`) and the trace from the retry.
2. If the failure involves generated data, read the `test-data-seed` attachment and rerun with
   `TEST_DATA_SEED=<value> npx playwright test -g "<test title>"`.
3. Reproduce under stress: `npx playwright test -g "<title>" --repeat-each=20 --workers=4`.
4. For API-level problems, read the redacted `api-exchanges.json` attachment.
