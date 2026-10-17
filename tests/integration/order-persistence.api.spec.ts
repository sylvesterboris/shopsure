import { randomUUID } from 'node:crypto';
import { expect, test } from '../../fixtures/testFixtures';
import { catalog } from '../../utils/testData';

/**
 * API -> database integration. Requires the local demo store to run with DATABASE_URL
 * (see README > Optional database setup); otherwise every test here is skipped.
 */
const lamp = catalog.byName('Lumen Desk Lamp');
const stickers = catalog.byName('Sticker Pack');

const toCents = (amount: number): number => Math.round(amount * 100);

test.describe('Order persistence (PostgreSQL)', () => {
  test(
    'an order placed through the API is stored with matching header fields',
    { tag: ['@db', '@regression'] },
    async ({ db, customer, data }) => {
      const shipping = data.customer({ lastName: "O'Neil" });

      const order = await customer.orders.placeOrder({
        customer: shipping,
        items: [{ productId: lamp.id, quantity: 2 }],
      });
      const row = await db.findOrder(order.id);

      expect(row).toBeDefined();
      expect(row).toMatchObject({
        username: customer.credentials.username,
        first_name: shipping.firstName,
        last_name: "O'Neil", // stored literally thanks to parameterized SQL
        email: shipping.email,
        postal_code: shipping.postalCode,
        status: 'PLACED',
        subtotal_cents: toCents(order.subtotal),
        tax_cents: toCents(order.tax),
        shipping_cents: toCents(order.shipping),
        total_cents: toCents(order.total),
      });
      expect(row?.created_at.toISOString()).toBe(order.createdAt);
    },
  );

  test(
    'stored line items add up to the stored subtotal and total',
    { tag: ['@db', '@regression'] },
    async ({ db, customer, data }) => {
      const order = await customer.orders.placeOrder({
        customer: data.customer(),
        items: [
          { productId: lamp.id, quantity: 3 },
          { productId: stickers.id, quantity: 7 },
        ],
      });

      const [row, items, sum] = await Promise.all([
        db.findOrder(order.id),
        db.findOrderItems(order.id),
        db.sumOrderItems(order.id),
      ]);

      expect(items).toHaveLength(2);
      for (const item of items) {
        expect(item.line_total_cents).toBe(item.unit_price_cents * item.quantity);
      }
      expect(sum).toEqual({ itemsTotalCents: row?.subtotal_cents, itemCount: 10 });
      expect(row?.total_cents).toBe(
        (row?.subtotal_cents ?? 0) + (row?.tax_cents ?? 0) + (row?.shipping_cents ?? 0),
      );
    },
  );

  test(
    'stored unit prices match the catalogue prices in the products table',
    { tag: ['@db', '@regression'] },
    async ({ db, customer, data }) => {
      const order = await customer.orders.placeOrder({
        customer: data.customer(),
        items: [
          { productId: lamp.id, quantity: 1 },
          { productId: stickers.id, quantity: 1 },
        ],
      });

      const rows = await db.findItemsWithCatalogPrice(order.id);

      expect(rows).toHaveLength(2);
      for (const r of rows) {
        expect(r.unit_price_cents).toBe(r.catalog_price_cents);
      }
      expect(rows.map((r) => r.unit_price_cents)).toEqual([
        toCents(lamp.price),
        toCents(stickers.price),
      ]);
    },
  );

  test(
    'cancelling an order updates its stored status',
    { tag: ['@db', '@regression'] },
    async ({ db, customer, data }) => {
      const order = await customer.orders.placeOrder({
        customer: data.customer(),
        items: [{ productId: stickers.id, quantity: 1 }],
      });

      await customer.orders.cancel(order.id);

      expect((await db.findOrder(order.id))?.status).toBe('CANCELLED');
    },
  );

  test(
    'an idempotent retry does not write a second row',
    { tag: ['@db', '@regression'] },
    async ({ db, customer, data }) => {
      const input = { customer: data.customer(), items: [{ productId: stickers.id, quantity: 1 }] };
      const key = randomUUID();

      await Promise.all([customer.orders.create(input, key), customer.orders.create(input, key)]);

      expect(await db.countOrdersForUsername(customer.credentials.username)).toBe(1);
    },
  );

  test(
    'a rejected order leaves no trace in the database',
    { tag: ['@db', '@regression'] },
    async ({ db, customer, data }) => {
      const response = await customer.orders.create({
        customer: data.customer(),
        items: [{ productId: catalog.byName('Zen Aroma Diffuser').id, quantity: 1 }],
      });

      expect(response.status).toBe(409);
      expect(await db.countOrdersForUsername(customer.credentials.username)).toBe(0);
    },
  );
});
