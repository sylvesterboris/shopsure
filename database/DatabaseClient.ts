import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool, type QueryResultRow } from 'pg';

/** Loads "-- name: key" blocks from queries.sql so SQL lives in one reviewable file. */
function loadNamedQueries(file: string): Map<string, string> {
  const queries = new Map<string, string>();
  let current: string | undefined;
  let buffer: string[] = [];
  const flush = (): void => {
    if (current) queries.set(current, buffer.join('\n').trim());
    buffer = [];
  };
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const header = /^--\s*name:\s*(\w+)\s*$/.exec(line);
    if (header) {
      flush();
      current = header[1];
    } else if (current && !line.trim().startsWith('--')) {
      buffer.push(line);
    }
  }
  flush();
  return queries;
}

export interface OrderRow {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  postal_code: string;
  subtotal_cents: number;
  tax_cents: number;
  shipping_cents: number;
  total_cents: number;
  status: string;
  created_at: Date;
}

export interface OrderItemRow {
  line_no: number;
  product_id: number;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
}

export interface CatalogPriceRow {
  product_id: number;
  unit_price_cents: number;
  catalog_price_cents: number;
}

/**
 * Read-mostly database access for validation tests. Every statement is a named,
 * parameterized query from database/queries.sql — values are never interpolated.
 */
export class DatabaseClient {
  private readonly pool: Pool;
  private readonly queries = loadNamedQueries(path.resolve(__dirname, 'queries.sql'));

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5_000 });
  }

  private async run<T extends QueryResultRow>(name: string, params: unknown[]): Promise<T[]> {
    const sql = this.queries.get(name);
    if (!sql) throw new Error(`Unknown query "${name}" in database/queries.sql`);
    const result = await this.pool.query<T>(sql, params);
    return result.rows;
  }

  async findOrder(orderId: string): Promise<OrderRow | undefined> {
    return (await this.run<OrderRow>('findOrderById', [orderId]))[0];
  }

  findOrderItems(orderId: string): Promise<OrderItemRow[]> {
    return this.run<OrderItemRow>('findOrderItems', [orderId]);
  }

  findItemsWithCatalogPrice(orderId: string): Promise<CatalogPriceRow[]> {
    return this.run<CatalogPriceRow>('findItemsWithCatalogPrice', [orderId]);
  }

  async sumOrderItems(orderId: string): Promise<{ itemsTotalCents: number; itemCount: number }> {
    const [row] = await this.run<{ items_total_cents: number; item_count: number }>(
      'sumOrderItems',
      [orderId],
    );
    return { itemsTotalCents: row?.items_total_cents ?? 0, itemCount: row?.item_count ?? 0 };
  }

  async countOrdersForUsername(username: string): Promise<number> {
    const [row] = await this.run<{ order_count: number }>('countOrdersForUsername', [username]);
    return row?.order_count ?? 0;
  }

  /** Cleanup: removes orders (and, via cascade, their items) created by a test user. */
  async deleteOrdersForUsername(username: string): Promise<void> {
    await this.run('deleteOrdersForUsername', [username]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
