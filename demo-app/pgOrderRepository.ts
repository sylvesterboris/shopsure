import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import type { Order, OrderStatus, Product } from './domain';
import type { OrderRepository } from './store';

interface OrderRow {
  id: string;
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  postal_code: string;
  subtotal_cents: number;
  tax_cents: number;
  shipping_cents: number;
  total_cents: number;
  status: OrderStatus;
  created_at: Date;
}

interface ItemRow {
  order_id: string;
  product_id: number;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
}

/** Stores orders in PostgreSQL. All statements are parameterized. */
export class PgOrderRepository implements OrderRepository {
  readonly kind = 'postgres' as const;
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 5 });
  }

  async init(products: Product[]): Promise<void> {
    const schema = readFileSync(path.resolve(__dirname, '..', 'database', 'schema.sql'), 'utf8');
    await this.pool.query(schema);
    for (const p of products) {
      await this.pool.query(
        `INSERT INTO products (id, sku, name, category, price_cents, in_stock)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE
           SET sku = EXCLUDED.sku, name = EXCLUDED.name, category = EXCLUDED.category,
               price_cents = EXCLUDED.price_cents, in_stock = EXCLUDED.in_stock`,
        [p.id, p.sku, p.name, p.category, p.priceCents, p.inStock],
      );
    }
  }

  async save(order: Order): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO orders (id, user_id, username, first_name, last_name, email, postal_code,
           subtotal_cents, tax_cents, shipping_cents, total_cents, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          order.id,
          order.userId,
          order.username,
          order.customer.firstName,
          order.customer.lastName,
          order.customer.email,
          order.customer.postalCode,
          order.subtotalCents,
          order.taxCents,
          order.shippingCents,
          order.totalCents,
          order.status,
          order.createdAt,
        ],
      );
      for (const [index, item] of order.items.entries()) {
        await client.query(
          `INSERT INTO order_items (order_id, line_no, product_id, product_name,
             unit_price_cents, quantity, line_total_cents)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            order.id,
            index + 1,
            item.productId,
            item.productName,
            item.unitPriceCents,
            item.quantity,
            item.lineTotalCents,
          ],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<Order | undefined> {
    const { rows } = await this.pool.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [id]);
    const row = rows[0];
    if (!row) return undefined;
    const items = await this.pool.query<ItemRow>(
      'SELECT * FROM order_items WHERE order_id = $1 ORDER BY line_no',
      [id],
    );
    return toOrder(row, items.rows);
  }

  async listByUser(userId: string): Promise<Order[]> {
    const { rows } = await this.pool.query<OrderRow>(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    if (rows.length === 0) return [];
    const items = await this.pool.query<ItemRow>(
      'SELECT * FROM order_items WHERE order_id = ANY($1::uuid[]) ORDER BY line_no',
      [rows.map((r) => r.id)],
    );
    return rows.map((r) =>
      toOrder(
        r,
        items.rows.filter((i) => i.order_id === r.id),
      ),
    );
  }

  async updateStatus(id: string, status: OrderStatus): Promise<void> {
    await this.pool.query('UPDATE orders SET status = $2 WHERE id = $1', [id, status]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function toOrder(row: OrderRow, items: ItemRow[]): Order {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    customer: {
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      postalCode: row.postal_code,
    },
    items: items.map((i) => ({
      productId: i.product_id,
      productName: i.product_name,
      unitPriceCents: i.unit_price_cents,
      quantity: i.quantity,
      lineTotalCents: i.line_total_cents,
    })),
    subtotalCents: row.subtotal_cents,
    taxCents: row.tax_cents,
    shippingCents: row.shipping_cents,
    totalCents: row.total_cents,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}
