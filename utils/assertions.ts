import { expect } from '@playwright/test';
import type AxeBuilder from '@axe-core/playwright';
import { z } from 'zod';
import type { ApiResult } from '../api/ApiClient';
import { ErrorSchema } from '../api/schemas';

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;

/**
 * Validates data against a Zod schema and returns it typed. On failure the error lists
 * every mismatching path, e.g. "✖ Invalid input: expected number, received string → at price".
 */
export function expectSchema<T extends z.ZodType>(
  schema: T,
  data: unknown,
  label = 'response',
): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`${label} does not match schema:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Asserts a status code and the standard error envelope, optionally checking the code. */
export function expectApiError(response: ApiResult, status: number, code?: string): void {
  expect(response.status, `unexpected status, body: ${response.text}`).toBe(status);
  const body = expectSchema(ErrorSchema, response.body, 'error response');
  if (code) expect(body.error.code).toBe(code);
}

/** Fails with a readable list of accessibility violations. */
export function expectNoA11yViolations(results: AxeResults): void {
  const summary = results.violations.map(
    (v) => `${v.id} [${v.impact ?? 'n/a'}]: ${v.help} (${v.nodes.length} node(s))`,
  );
  expect(summary, 'accessibility violations').toEqual([]);
}
