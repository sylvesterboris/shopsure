# ShopSure — Playwright + TypeScript test automation framework

[![ShopSure tests](https://github.com/sylvesterboris/shopsure-playwright/actions/workflows/playwright.yml/badge.svg)](https://github.com/sylvesterboris/shopsure-playwright/actions/workflows/playwright.yml)

End-to-end UI, REST API, contract, database, accessibility and visual tests for an e-commerce
store, built with Playwright Test and TypeScript and run in GitHub Actions across Chromium,
Firefox and WebKit.

> The badge points at `sylvesterboris/shopsure-playwright`. If you publish under another name,
> update the two URLs on the line above.

---

## 1. Overview

ShopSure is a QA automation portfolio project. It tests a small e-commerce store (bundled in
`demo-app/`) through its browser UI, its REST API and its PostgreSQL database, using the patterns
expected in a production test suite: Page Object Model, custom fixtures, API service clients,
schema validation, isolated test data, tagging, sharded CI and actionable failure reports.

## 2. Problem statement

E-commerce regressions are expensive: a wrong total, a lost cart or a duplicate order costs money
and trust. Manual checks of login → search → cart → checkout across browsers do not scale, and
UI-only automation misses API contract and data-integrity problems. ShopSure shows how to cover
those layers with fast, independent, reproducible tests that run on every pull request.

**Why a bundled demo store?** Public demo shops change without notice, rarely expose an API or a
database, and cannot be reset. A small local store makes every run reproducible, lets CI run with
no external dependencies, and allows real database validation. The framework never imports app
code; expected values are defined independently (see [architecture](docs/architecture.md)).

## 3. Key features

- **UI tests** for authentication, sessions, catalogue, cart and checkout (Page Object Model).
- **API tests** for auth, products (incl. admin CRUD), cart and orders using Playwright's `APIRequestContext`.
- **Zod contract schemas**, plus tests proving the schemas reject missing fields, wrong types and leaked fields.
- **Optional PostgreSQL validation** with parameterized, named queries; skipped cleanly when not configured.
- **Isolation by design**: every test gets a freshly registered user; temporary products are cleaned up.
- **Request interception** for API errors, network failures, malformed and empty responses.
- **Accessibility** scans with axe-core (WCAG 2.1 A/AA) and **visual regression** for stable components.
- **Diagnostics**: screenshots, traces on retry, video on CI failures, redacted API exchange logs, reproducible data seeds.
- **CI/CD**: lint/type gate → smoke → sharded cross-browser regression + API/DB job → merged HTML report and job summary.

## 4. Technology stack

| Tool                                                                 | Version                 | Role                                                       |
| -------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------- |
| Node.js                                                              | 22 (>= 20.11 supported) | Runtime (`.nvmrc`)                                         |
| TypeScript                                                           | 5.9 (strict)            | Language                                                   |
| @playwright/test                                                     | 1.56.0                  | UI + API test runner                                       |
| Zod                                                                  | 4.6                     | Response schemas (tests) and request validation (demo app) |
| @axe-core/playwright                                                 | 4.14                    | Accessibility scans                                        |
| pg                                                                   | 8.23                    | PostgreSQL client                                          |
| Express                                                              | 5.3                     | Demo store                                                 |
| ESLint 10 + typescript-eslint + eslint-plugin-playwright, Prettier 3 |                         | Code quality                                               |
| GitHub Actions                                                       |                         | CI/CD                                                      |

## 5. Architecture

```mermaid
flowchart LR
  subgraph Tests
    UI[UI specs] --> FX
    API[API specs] --> FX
    INT[DB integration specs] --> FX
  end
  FX[Fixtures] --> POM[Page objects]
  FX --> SVC[API services + Zod schemas]
  FX --> DBC[DatabaseClient]
  POM -->|Chromium / Firefox / WebKit| APP
  SVC -->|HTTP| APP
  subgraph APP[demo-app: system under test]
    WEB[Express UI + REST API]
  end
  WEB --> PG[(PostgreSQL, optional)]
  DBC -->|parameterized SQL| PG
```

Details and design decisions: [docs/architecture.md](docs/architecture.md).

## 6. Repository structure

```text
shopsure-playwright/
├── tests/
│   ├── ui/            auth/ products/ cart/ checkout/ a11y/ visual/
│   ├── api/           auth/ products/ orders/ schemas/
│   ├── integration/   *.api.spec.ts and *.ui.spec.ts that verify PostgreSQL
│   └── __snapshots__/ visual baselines (Chromium, Linux)
├── pages/             LoginPage, ProductsPage, ProductDetailPage, CartPage, CheckoutPage,
│                      OrderConfirmationPage, AppHeader
├── fixtures/          testFixtures.ts (page objects, API users, temp products, DB, data)
├── api/               ApiClient, AuthApi, ProductsApi, CartApi, OrdersApi, schemas.ts
├── database/          DatabaseClient.ts, queries.sql (named queries), schema.sql
├── utils/             environment, testDataFactory, testData, pricing (oracle), assertions, logger
├── test-data/         products.json (expected catalogue), users.json (negative login cases)
├── scripts/           generate-summary.ts
├── demo-app/          the system under test (Express server, views, static JS/CSS)
├── docs/              architecture, test strategy, flaky tests, environment setup, bug reports
├── .github/           workflows/playwright.yml, actions/setup/action.yml
├── playwright.config.ts, tsconfig.json, eslint.config.mjs, .prettierrc, .env.example
└── package.json
```

> ESLint 10 only supports flat config, so `eslint.config.mjs` replaces the `.eslintrc.json` named in the original brief.

## 7. Prerequisites

- Node.js 22 (or >= 20.11) and npm
- Linux, macOS or Windows (WSL recommended)
- Optional: PostgreSQL 13+ or Docker for the database tests

## 8. Installation

```bash
git clone https://github.com/sylvesterboris/shopsure-playwright.git
cd shopsure-playwright
npm ci
npx playwright install --with-deps          # all browsers
# or only what you need: npx playwright install --with-deps chromium
cp .env.example .env
```

## 9. Environment configuration

`.env.example` documents every variable. The defaults work out of the box against the bundled
store, which Playwright starts automatically. Full reference, CI secrets and database setup:
[docs/environment-setup.md](docs/environment-setup.md).

## 10. Run UI tests

```bash
npm run test:ui                 # tests/ui on Chromium
npm run test:headed             # Chromium, visible browser
```

## 11. Run API tests

```bash
npm run test:api                # API project (no browser). DB specs skip without DATABASE_URL
```

## 12. Run smoke tests

```bash
npm run test:smoke              # @smoke on API + Chromium (20 tests)
```

## 13. Run regression tests

```bash
npm run test:regression         # @regression on every project (needs all three browsers installed)
npm test                        # everything, every project
```

## 14. Run specific tests

```bash
npx playwright test tests/ui/cart/cart.spec.ts --project=chromium
npx playwright test -g "free shipping" --project=chromium     # by title
npx playwright test --grep @a11y --project=chromium            # by tag: @smoke @regression @db @a11y @visual
npx playwright test tests/ui/checkout/checkout.spec.ts:<line>  # by line number
```

## 15. Select browsers

```bash
npm run test:chromium
npm run test:firefox
npm run test:webkit
npx playwright test --project=chromium --project=webkit
```

## 16. Debug failures

```bash
npm run test:debug                                  # Playwright Inspector, step through
npx playwright test --ui                            # UI mode: watch, time-travel, pick locators
npx playwright show-trace test-results/<test>/trace.zip
LOG_LEVEL=debug npm run test:api                    # log every API call (secrets redacted)
TEST_DATA_SEED=123 npx playwright test -g "<title>" # replay generated data from a failure
```

Each failed test in the report includes: title, project/browser, error and call log, screenshot,
trace (on retry), video (CI), the redacted `api-exchanges.json` it made, and the `test-data-seed`.

## 17. View HTML reports

```bash
npm run report                  # opens reports/html
npm run summary                 # pass/fail/flaky/skipped per project from reports/results.json
```

## 18. GitHub Actions

`.github/workflows/playwright.yml` runs on pushes and pull requests to `main`:

| Job                   | What it does                                                                       |
| --------------------- | ---------------------------------------------------------------------------------- |
| `static`              | `npm ci`, type check, ESLint (zero warnings), Prettier check                       |
| `smoke`               | `@smoke` on API + Chromium; uploads report, and traces on failure                  |
| `regression-browsers` | `@regression` on Chromium, Firefox, WebKit, each split into 2 shards (6 jobs)      |
| `regression-api-db`   | API + DB integration against a PostgreSQL 16 service container                     |
| `report`              | Merges all shard reports into one HTML report + JSON, writes the job summary       |
| `visual`              | Manual (`workflow_dispatch`): runs or regenerates visual baselines on the CI image |

Concurrency cancels superseded PR runs; browsers are cached per Playwright version; artifacts
are kept 3–14 days. No secrets are required (see [environment setup](docs/environment-setup.md)).

## 19. Optional database setup

```bash
docker run -d --name shopsure-db -p 5432:5432 \
  -e POSTGRES_USER=shopsure -e POSTGRES_PASSWORD=shopsure -e POSTGRES_DB=shopsure postgres:16
echo "DATABASE_URL=postgres://shopsure:shopsure@127.0.0.1:5432/shopsure" >> .env
npm run test:db
```

With `DATABASE_URL` set, the demo store persists orders in PostgreSQL and test users' orders are
deleted after each test. Without it, `@db` tests are skipped with a reason, never failed.

## 20. Known limitations

- **Bundled target.** The system under test is a small local app, not a production shop. It has
  no payments, stock reservation, password reset or email. Tests only cover what it implements.
- **Users, carts and sessions are in memory** in the demo store and reset on restart; only orders
  go to PostgreSQL. There is no user-deletion endpoint, so test users are not removed (they vanish
  when the server stops).
- **Firefox and WebKit were not executed in the environment this project was built in** (browser
  downloads were blocked there). They are configured and run in the CI `regression-browsers` job;
  until that job has run green, treat them as unverified.
- **Visual baselines** were generated on Linux Chromium. Font rendering differs between machines,
  so visual tests run in a separate manual CI job; regenerate baselines there with
  `update_snapshots: true` and commit the uploaded snapshots.
- The demo store has no CSRF protection or rate limiting; tests do not cover them.
- Response-time checks are deliberately generous smoke thresholds, not performance tests.

## 21. Test strategy

Scope, levels, techniques (boundaries, decision tables, state transitions, concurrency) and exit
criteria: [docs/test-strategy.md](docs/test-strategy.md). Flaky-test prevention:
[docs/flaky-tests.md](docs/flaky-tests.md).

## 22. Future enhancements

- Run against a second, independently deployed target via `BASE_URL` to prove portability.
- Contract tests generated from an OpenAPI description of the API.
- k6 or Artillery load tests for checkout.
- Publish the merged HTML report to GitHub Pages on `main`.
- Test-impact analysis to run only specs affected by a change.

## 23. Report evidence

Results below are from runs on 17 October 2026 in the build environment (Linux, Node 22.22,
Chromium 141, PostgreSQL 16.15). See [Known limitations](#20-known-limitations) for what was not run.

| Check                                                                | Result                                              |
| -------------------------------------------------------------------- | --------------------------------------------------- |
| `npm run typecheck` / `lint` / `format:check`                        | pass / pass, 0 warnings / pass                      |
| API + Chromium, with PostgreSQL (`--project=api --project=chromium`) | **209 passed**, 0 failed, 0 flaky, 0 skipped        |
| Same, repeated 3× with 4 workers (`--repeat-each=3 --workers=4`)     | **627 passed**, 0 failed, 0 flaky                   |
| Without `DATABASE_URL`                                               | 7 database tests skipped with reason, the rest pass |
| Firefox (82 tests), WebKit (82 tests)                                | not run locally; run in CI                          |

Test inventory: 124 API-project tests, 85 Chromium tests (82 shared with Firefox and WebKit plus 3 visual).
The suite found two real defects in the demo store during development, documented in
[docs/bug-reports](docs/bug-reports/).

![HTML report from a local run](docs/images/html-report.png)

## 24. License and contributing

MIT, see [LICENSE](LICENSE).

Contributions are welcome: open an issue describing the change, keep tests independent, use
role/label/test-id locators, tag new tests `@smoke` or `@regression`, and run `npm run check`
and the relevant suite before opening a pull request.
