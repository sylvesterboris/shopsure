import type { APIRequestContext, APIResponse } from '@playwright/test';
import { logger, redact } from '../utils/logger';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  /** JSON body. Use `rawBody` to send malformed payloads on purpose. */
  data?: unknown;
  rawBody?: string;
  params?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  /** Overrides the client's token for this call; pass null to send no token. */
  token?: string | null;
}

export interface ApiResult<T = unknown> {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  /** Parsed JSON body, or null for empty / non-JSON responses. */
  body: T;
  text: string;
  durationMs: number;
}

/** A redacted record of an HTTP exchange, attached to the report when a test fails. */
export interface Exchange {
  method: HttpMethod;
  url: string;
  requestBody: unknown;
  status: number;
  durationMs: number;
  responseBody: unknown;
}

/**
 * Thin wrapper around Playwright's APIRequestContext that adds bearer auth, timing,
 * JSON parsing and a redacted exchange log for diagnostics.
 */
export class ApiClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly token?: string,
    /** Shared between a client and the clients derived from it with withToken(). */
    private readonly exchanges: Exchange[] = [],
  ) {}

  /** Returns a client that shares the request context and exchange log but uses another token. */
  withToken(token: string | undefined): ApiClient {
    return new ApiClient(this.request, token, this.exchanges);
  }

  get history(): readonly Exchange[] {
    return this.exchanges;
  }

  get<T = unknown>(url: string, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.send<T>('GET', url, options);
  }
  post<T = unknown>(url: string, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.send<T>('POST', url, options);
  }
  put<T = unknown>(url: string, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.send<T>('PUT', url, options);
  }
  patch<T = unknown>(url: string, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.send<T>('PATCH', url, options);
  }
  delete<T = unknown>(url: string, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.send<T>('DELETE', url, options);
  }

  private async send<T>(
    method: HttpMethod,
    url: string,
    options: RequestOptions = {},
  ): Promise<ApiResult<T>> {
    const token = options.token === undefined ? this.token : options.token;
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.rawBody !== undefined) headers['Content-Type'] ??= 'application/json';

    const started = performance.now();
    const response: APIResponse = await this.request.fetch(url, {
      method,
      headers,
      ...(options.params ? { params: options.params } : {}),
      ...(options.rawBody !== undefined
        ? { data: options.rawBody }
        : options.data !== undefined
          ? { data: options.data }
          : {}),
      failOnStatusCode: false,
    });
    const durationMs = Math.round(performance.now() - started);

    const text = await response.text();
    const contentType = response.headers()['content-type'] ?? '';
    let body: unknown = null;
    if (text && contentType.includes('application/json')) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }

    const exchange: Exchange = {
      method,
      url: response.url(),
      requestBody: redact(options.data ?? options.rawBody ?? null),
      status: response.status(),
      durationMs,
      responseBody: redact(body),
    };
    this.exchanges.push(exchange);
    logger.debug(`${method} ${url} -> ${response.status()} (${durationMs} ms)`);

    return {
      status: response.status(),
      ok: response.ok(),
      headers: response.headers(),
      body: body as T,
      text,
      durationMs,
    };
  }
}
