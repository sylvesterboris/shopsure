import { randomUUID } from 'node:crypto';
import { expect, test } from '../../../fixtures/testFixtures';
import { CartSchema, OrderListSchema, OrderSchema } from '../../../api/schemas';
import { expectApiError, expectSchema } from '../../../utils/assertions';
import { env } from '../../../utils/environment';
import { expectedTotals } from '../../../utils/pricing';
import { catalog } from '../../../utils/testData';

const backpack = catalog.byName('Atlas Laptop Backpack'); // $64.00
const stickers = catalog.byName('Sticker Pack'); // $0.99
const speaker = catalog.byName('Pulse Bluetooth Speaker'); // $49.99
const diffuser = catalog.byName('Zen Aroma Diffuser'); // out of stock

test.describe('POST /api/orders', () => {
  test(
    'creates an order with server-calculated totals',
    { tag: ['@smoke', '@regression'] },
    async ({ customer, data }) => {
      const shipping = data.customer();
      const lines = [
        { product: backpack, quantity: 1 },
        { product: stickers, quantity: 4 },
      ];

      const response = await customer.orders.create({
        customer: shipping,
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      });

      expect(response.status).toBe(201);
      const order = expectSchema(OrderSchema, response.body);
      expect(response.headers.location).toBe(`/api/orders/${order.id}`);
      expect(order.status).toBe('PLACED');
      expect(order.customer).toEqual(shipping);
      const expected = expectedTotals(
        lines.map((l) => ({ unitPrice: l.product.price, quantity: l.quantity })),
      );
      expect(order).toMatchObject({
        subtotal: expected.subtotal,
        tax: expected.tax,
        shipping: expected.shipping,
        total: expected.total,
      });
      expect(order.items).toEqual([
        { productId: backpack.id, name: backpack.name, unitPrice: 64, quantity: 1, lineTotal: 64 },
        {
          productId: stickers.id,
          name: stickers.name,
          unitPrice: 0.99,
          quantity: 4,
          lineTotal: 3.96,
        },
      ]);
      expect(response.durationMs).toBeLessThan(env.apiResponseTimeLimitMs);
    },
  );

  test(
    'ignores client-supplied prices and totals',
    { tag: '@regression' },
    async ({ customer, data }) => {
      const response = await customer.orders.create({
        customer: data.customer(),
        items: [{ productId: speaker.id, quantity: 1, unitPrice: 0.01 }],
        total: 0.01,
      });

      const order = expectSchema(OrderSchema, response.body);
      expect(order.items[0]?.unitPrice).toBe(speaker.price);
      expect(order.total).toBe(expectedTotals([{ unitPrice: speaker.price, quantity: 1 }]).total);
    },
  );

  test(
    'without items, orders the cart contents and empties the cart',
    { tag: '@regression' },
    async ({ customer, data }) => {
      await customer.cart.fill([{ productId: speaker.id, quantity: 2 }]);

      const order = expectSchema(
        OrderSchema,
        (await customer.orders.create({ customer: data.customer() })).body,
      );

      expect(order.items).toEqual([
        expect.objectContaining({ productId: speaker.id, quantity: 2 }),
      ]);
      expect(expectSchema(CartSchema, (await customer.cart.get()).body).itemCount).toBe(0);
    },
  );

  test('ordering an empty cart is rejected', { tag: '@regression' }, async ({ customer, data }) => {
    expectApiError(await customer.orders.create({ customer: data.customer() }), 400, 'EMPTY_ORDER');
  });

  test(
    'duplicate lines for one product are merged',
    { tag: '@regression' },
    async ({ customer, data }) => {
      const order = await customer.orders.placeOrder({
        customer: data.customer(),
        items: [
          { productId: stickers.id, quantity: 2 },
          { productId: stickers.id, quantity: 3 },
        ],
      });

      expect(order.items).toEqual([
        expect.objectContaining({ productId: stickers.id, quantity: 5 }),
      ]);
    },
  );

  test('requires authentication', { tag: '@regression' }, async ({ api, data }) => {
    const response = await api.post('/api/orders', {
      data: { customer: data.customer(), items: [{ productId: 1, quantity: 1 }] },
    });

    expectApiError(response, 401, 'UNAUTHENTICATED');
  });

  test.describe('idempotency', () => {
    test(
      'repeating a request with the same Idempotency-Key returns the original order',
      { tag: '@regression' },
      async ({ customer, data }) => {
        const input = {
          customer: data.customer(),
          items: [{ productId: stickers.id, quantity: 1 }],
        };
        const key = randomUUID();

        const first = await customer.orders.create(input, key);
        const second = await customer.orders.create(input, key);

        expect(first.status).toBe(201);
        expect(second.status).toBe(200);
        expect(expectSchema(OrderSchema, second.body).id).toBe(
          expectSchema(OrderSchema, first.body).id,
        );
        expect(expectSchema(OrderListSchema, (await customer.orders.list()).body).total).toBe(1);
      },
    );

    test(
      'concurrent requests with the same key create exactly one order',
      { tag: '@regression' },
      async ({ customer, data }) => {
        const input = {
          customer: data.customer(),
          items: [{ productId: stickers.id, quantity: 1 }],
        };
        const key = randomUUID();

        const responses = await Promise.all(
          Array.from({ length: 5 }, () => customer.orders.create(input, key)),
        );

        const ids = new Set(responses.map((r) => expectSchema(OrderSchema, r.body).id));
        expect(ids.size).toBe(1);
        expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
        expect(expectSchema(OrderListSchema, (await customer.orders.list()).body).total).toBe(1);
      },
    );

    test(
      'different keys create different orders',
      { tag: '@regression' },
      async ({ customer, data }) => {
        const input = {
          customer: data.customer(),
          items: [{ productId: stickers.id, quantity: 1 }],
        };

        await customer.orders.create(input, randomUUID());
        await customer.orders.create(input, randomUUID());

        expect(expectSchema(OrderListSchema, (await customer.orders.list()).body).total).toBe(2);
      },
    );
  });

  test.describe('payload validation', () => {
    const invalid: Array<{
      name: string;
      body: (c: Record<string, string>) => Record<string, unknown>;
      field: string;
    }> = [
      {
        name: 'missing customer',
        body: () => ({ items: [{ productId: 1, quantity: 1 }] }),
        field: 'customer',
      },
      {
        name: 'invalid email',
        body: (c) => ({
          customer: { ...c, email: 'nope' },
          items: [{ productId: 1, quantity: 1 }],
        }),
        field: 'customer.email',
      },
      {
        name: 'postal code of 5 digits',
        body: (c) => ({
          customer: { ...c, postalCode: '12345' },
          items: [{ productId: 1, quantity: 1 }],
        }),
        field: 'customer.postalCode',
      },
      {
        name: 'quantity 0',
        body: (c) => ({ customer: c, items: [{ productId: 1, quantity: 0 }] }),
        field: 'items.0.quantity',
      },
      {
        name: 'quantity 11',
        body: (c) => ({ customer: c, items: [{ productId: 1, quantity: 11 }] }),
        field: 'items.0.quantity',
      },
      {
        name: 'fractional quantity',
        body: (c) => ({ customer: c, items: [{ productId: 1, quantity: 1.5 }] }),
        field: 'items.0.quantity',
      },
      {
        name: 'quantity as a string',
        body: (c) => ({ customer: c, items: [{ productId: 1, quantity: '2' }] }),
        field: 'items.0.quantity',
      },
      {
        name: 'missing productId',
        body: (c) => ({ customer: c, items: [{ quantity: 1 }] }),
        field: 'items.0.productId',
      },
    ];

    for (const c of invalid) {
      test(`rejects ${c.name}`, { tag: '@regression' }, async ({ customer, data }) => {
        const response = await customer.orders.create(c.body({ ...data.customer() }));

        expectApiError(response, 400, 'VALIDATION_ERROR');
        const details = (response.body as { error: { details: Array<{ field: string }> } }).error
          .details;
        expect(details.map((d) => d.field)).toContain(c.field);
      });
    }

    test(
      'accepts the boundary quantity 10 and rejects a non-existent product',
      { tag: '@regression' },
      async ({ customer, data }) => {
        const ok = await customer.orders.create({
          customer: data.customer(),
          items: [{ productId: stickers.id, quantity: 10 }],
        });
        const missing = await customer.orders.create({
          customer: data.customer(),
          items: [{ productId: 999999, quantity: 1 }],
        });

        expect(ok.status).toBe(201);
        expectApiError(missing, 404, 'PRODUCT_NOT_FOUND');
      },
    );

    test('rejects an out-of-stock product', { tag: '@regression' }, async ({ customer, data }) => {
      const response = await customer.orders.create({
        customer: data.customer(),
        items: [{ productId: diffuser.id, quantity: 1 }],
      });

      expectApiError(response, 409, 'OUT_OF_STOCK');
    });
  });
});

test.describe('Reading and cancelling orders', () => {
  test(
    'a customer can list and fetch their own orders',
    { tag: '@regression' },
    async ({ customer, data }) => {
      const order = await customer.orders.placeOrder({
        customer: data.customer(),
        items: [{ productId: stickers.id, quantity: 1 }],
      });

      const list = expectSchema(OrderListSchema, (await customer.orders.list()).body);
      const fetched = expectSchema(OrderSchema, (await customer.orders.get(order.id)).body);

      expect(list.data.map((o) => o.id)).toEqual([order.id]);
      expect(fetched).toEqual(order);
    },
  );

  test(
    "another customer's order is reported as not found",
    { tag: ['@smoke', '@regression'] },
    async ({ customer, authApi, api, data }) => {
      const order = await customer.orders.placeOrder({
        customer: data.customer(),
        items: [{ productId: stickers.id, quantity: 1 }],
      });
      const intruderUser = data.newUser();
      await authApi.registerUser(intruderUser);
      const intruder = api.withToken((await authApi.authenticate(intruderUser)).token);

      expectApiError(await intruder.get(`/api/orders/${order.id}`), 404, 'ORDER_NOT_FOUND');
      expectApiError(
        await intruder.patch(`/api/orders/${order.id}`, { data: { status: 'CANCELLED' } }),
        404,
        'ORDER_NOT_FOUND',
      );
      expect(expectSchema(OrderListSchema, (await intruder.get('/api/orders')).body).total).toBe(0);
    },
  );

  test('an admin can read any order', { tag: '@regression' }, async ({ customer, admin, data }) => {
    const order = await customer.orders.placeOrder({
      customer: data.customer(),
      items: [{ productId: stickers.id, quantity: 1 }],
    });

    expect((await admin.orders.get(order.id)).status).toBe(200);
  });

  for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid', "1' OR '1'='1"]) {
    test(
      `unknown or malformed order id "${id}" returns 404`,
      { tag: '@regression' },
      async ({ customer }) => {
        expectApiError(await customer.orders.get(encodeURIComponent(id)), 404, 'ORDER_NOT_FOUND');
      },
    );
  }

  test(
    'a placed order can be cancelled exactly once',
    { tag: '@regression' },
    async ({ customer, data }) => {
      const order = await customer.orders.placeOrder({
        customer: data.customer(),
        items: [{ productId: stickers.id, quantity: 1 }],
      });

      const cancelled = await customer.orders.cancel(order.id);
      const again = await customer.orders.cancel(order.id);

      expect(expectSchema(OrderSchema, cancelled.body).status).toBe('CANCELLED');
      expectApiError(again, 409, 'INVALID_STATUS_TRANSITION');
      expect(expectSchema(OrderSchema, (await customer.orders.get(order.id)).body).status).toBe(
        'CANCELLED',
      );
    },
  );

  test(
    'only a status change to CANCELLED is allowed',
    { tag: '@regression' },
    async ({ customer, api, data }) => {
      const order = await customer.orders.placeOrder({
        customer: data.customer(),
        items: [{ productId: stickers.id, quantity: 1 }],
      });
      const client = api.withToken(customer.token);

      expectApiError(
        await client.patch(`/api/orders/${order.id}`, { data: { status: 'SHIPPED' } }),
        400,
        'VALIDATION_ERROR',
      );
      expectApiError(
        await client.patch(`/api/orders/${order.id}`, { data: { status: 'CANCELLED', total: 0 } }),
        400,
        'VALIDATION_ERROR',
      );
    },
  );
});
