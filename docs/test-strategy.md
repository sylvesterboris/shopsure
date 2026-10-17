# Test strategy

## Scope

| Area           | Covered                                                                                                                                | Not covered (and why)                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Authentication | Login success/failure, empty fields, locked account, logout, session revocation, protected routes, safe `next` redirects               | Password reset, MFA (the app has neither) |
| Catalogue      | Listing, prices vs. oracle, search, category filter, sorting, detail page, unknown ids, out-of-stock                                   | Images, reviews (not in the app)          |
| Cart           | Add/remove/update, quantity boundaries, totals, free-shipping threshold, persistence, isolation between users                          | Stock reservation (the app has none)      |
| Checkout       | Happy path, required fields, invalid details, name-length boundaries, duplicate submissions, refresh, back button, other users' orders | Payment (the app has no payment step)     |
| API            | Auth, products (incl. admin CRUD), cart, orders, pagination, filtering, validation, authorization, idempotency, headers, response time | Load/performance testing                  |
| Contracts      | Zod schemas for users, products, carts, orders and errors, plus tests proving the schemas reject bad data                              |                                           |
| Database       | Order header, line items, totals, catalogue prices, status updates, idempotency, rejected orders                                       | Migrations (schema is applied at startup) |
| Resilience     | API 500, network failure, malformed and empty responses, add-to-cart failure (via request interception)                                |                                           |
| Accessibility  | axe-core WCAG 2.1 A/AA scans of every page, including error states                                                                     | Manual screen-reader testing              |
| Visual         | Three stable components on Chromium                                                                                                    | Full-page visuals (too brittle)           |

## Test levels and where they run

| Level                                 | Location            | Tags          | Local command                        | CI job              |
| ------------------------------------- | ------------------- | ------------- | ------------------------------------ | ------------------- |
| Smoke: one critical check per feature | across suites       | `@smoke`      | `npm run test:smoke`                 | `smoke`             |
| Regression: everything else           | across suites       | `@regression` | `npm run test:regression`            | `regression-*`      |
| Database integration                  | `tests/integration` | `@db`         | `npm run test:db`                    | `regression-api-db` |
| Accessibility                         | `tests/ui/a11y`     | `@a11y`       | `npx playwright test --grep @a11y`   | inside regression   |
| Visual                                | `tests/ui/visual`   | `@visual`     | `npx playwright test --grep @visual` | `visual` (manual)   |

## Test design techniques used

- **Equivalence partitioning and boundary values**: quantities (0, 1, 10, 11, -1, 2.5, ""), prices
  (0.00, 0.01, 10000, 10000.01, 3 decimals), names (1, 50, 51 chars), usernames/passwords
  (lengths around each limit), postal codes (5, 6, 7 digits, letters), page/limit parameters.
- **Decision tables**: shipping charge around the $50.00 threshold ($49.99 vs $50.00).
- **State transitions**: order `PLACED -> CANCELLED`, and cancelling twice (409).
- **Error guessing**: SQL-injection-style input, user enumeration, open redirects, client-supplied
  prices, unknown fields in PATCH, leaked fields in responses.
- **Concurrency**: simultaneous duplicate checkout submissions and idempotent API retries.

## Independence and data

- Every test that touches a cart or orders gets a newly registered user (`customer` fixture).
- Admin tests only modify products they created (`createTempProduct`), which are deleted afterwards. Seed products are read-only by design.
- With a database configured, each test user's orders are deleted in fixture teardown.
- No test depends on another test's side effects or on execution order; the suite was run
  3 times in a row with 4 parallel workers (627 executions) without a failure or flaky result.

## Entry and exit criteria

- **Pull request**: lint, type check and formatting pass; smoke suite passes; regression passes on
  Chromium, Firefox and WebKit plus API+DB.
- A test that passes only on retry is reported as **flaky** in the HTML report and in the run
  summary. Flaky tests are investigated, not accepted.

## Defects found while building the suite

Two real defects were found in the demo store by these tests during development. Both are
documented in [`bug-reports/`](bug-reports/) and are now covered by regression tests.

See also: [flaky-tests.md](flaky-tests.md), [architecture.md](architecture.md).
