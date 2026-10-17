# Environment setup

## Variables

All configuration is read from environment variables, loaded from `.env` by `utils/environment.ts`
(the tests) and `demo-app/server.ts` (the demo store). `.env` is git-ignored; `.env.example` is the
template.

| Variable                                   | Required | Default                 | Purpose                                                                                                |
| ------------------------------------------ | -------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `BASE_URL`                                 | no       | `http://127.0.0.1:4173` | Application under test                                                                                 |
| `START_LOCAL_SERVER`                       | no       | `true`                  | Start the demo store before tests. Set `false` when `BASE_URL` points at an already running deployment |
| `PORT`                                     | no       | `4173`                  | Port for the local demo store                                                                          |
| `STANDARD_USER` / `STANDARD_USER_PASSWORD` | yes      | —                       | Seeded customer account                                                                                |
| `LOCKED_USER` / `LOCKED_USER_PASSWORD`     | yes      | —                       | Seeded locked account                                                                                  |
| `ADMIN_USER` / `ADMIN_USER_PASSWORD`       | yes      | —                       | Seeded admin account                                                                                   |
| `API_RESPONSE_TIME_LIMIT_MS`               | no       | `2000`                  | Generous upper bound for response-time assertions                                                      |
| `TEST_DATA_SEED`                           | no       | random                  | Makes generated test data reproducible                                                                 |
| `LOG_LEVEL`                                | no       | `info`                  | `debug` logs every API call (redacted)                                                                 |
| `DATABASE_URL`                             | no       | —                       | Enables PostgreSQL persistence in the demo store and the database tests                                |

The values in `.env.example` are throwaway credentials that only exist in the memory of the local
demo store. A missing required variable fails only the tests that need it, with a message naming
the variable.

## GitHub Actions secrets and variables

None are required: the workflow copies `.env.example` to `.env`. To use different credentials,
add any of these **repository secrets** (Settings → Secrets and variables → Actions); when present
they override the template values and are never printed:

| Secret                   | Overrides            |
| ------------------------ | -------------------- |
| `STANDARD_USER_PASSWORD` | `.env.example` value |
| `LOCKED_USER_PASSWORD`   | `.env.example` value |
| `ADMIN_USER_PASSWORD`    | `.env.example` value |

The `regression-api-db` job starts its own PostgreSQL 16 service container, so no database secret
is needed.

## Optional PostgreSQL

Any PostgreSQL 13+ works. Two ways to get one:

**Docker**

```bash
docker run -d --name shopsure-db -p 5432:5432 \
  -e POSTGRES_USER=shopsure -e POSTGRES_PASSWORD=shopsure -e POSTGRES_DB=shopsure postgres:16
```

**Existing local server**

```bash
sudo -u postgres psql -c "CREATE ROLE shopsure LOGIN PASSWORD 'shopsure';"
sudo -u postgres psql -c "CREATE DATABASE shopsure OWNER shopsure;"
```

Then add to `.env`:

```bash
DATABASE_URL=postgres://shopsure:shopsure@127.0.0.1:5432/shopsure
```

The demo store creates its tables on startup (`database/schema.sql`); `npm run db:setup` applies
the same schema manually if you prefer. Run `npm run test:db`.

If a demo store started **without** `DATABASE_URL` is still running locally, Playwright reuses it
and the database tests skip with the message "The application under test is not storing orders in
Postgres". Stop that server and rerun.
