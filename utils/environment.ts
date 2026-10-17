import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        'Copy .env.example to .env (local) or define it as a CI secret/variable.',
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? undefined : value;
}

function numberFrom(name: string, fallback: number): number {
  const raw = optional(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number, got "${raw}"`);
  }
  return parsed;
}

export interface Credentials {
  username: string;
  password: string;
}

export interface Environment {
  baseUrl: string;
  startLocalServer: boolean;
  port: number;
  isCI: boolean;
  apiResponseTimeLimitMs: number;
  testDataSeed: number | undefined;
  databaseUrl: string | undefined;
}

const port = numberFrom('PORT', 4173);

/** Non-secret runtime configuration. Safe to read at config-load time. */
export const env: Environment = {
  baseUrl: optional('BASE_URL') ?? `http://127.0.0.1:${port}`,
  startLocalServer: (optional('START_LOCAL_SERVER') ?? 'true').toLowerCase() !== 'false',
  port,
  isCI: Boolean(process.env.CI),
  apiResponseTimeLimitMs: numberFrom('API_RESPONSE_TIME_LIMIT_MS', 2000),
  testDataSeed:
    optional('TEST_DATA_SEED') === undefined ? undefined : numberFrom('TEST_DATA_SEED', 1),
  databaseUrl: optional('DATABASE_URL'),
};

/**
 * Seeded account credentials. Read lazily so that a missing secret fails the
 * tests that need it with a clear message instead of breaking config loading.
 */
export const accounts = {
  standard: (): Credentials => ({
    username: required('STANDARD_USER'),
    password: required('STANDARD_USER_PASSWORD'),
  }),
  locked: (): Credentials => ({
    username: required('LOCKED_USER'),
    password: required('LOCKED_USER_PASSWORD'),
  }),
  admin: (): Credentials => ({
    username: required('ADMIN_USER'),
    password: required('ADMIN_USER_PASSWORD'),
  }),
};
