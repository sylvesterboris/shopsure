import { expect, test } from '../../../fixtures/testFixtures';
import { CartSchema } from '../../../api/schemas';
import { expectApiError, expectSchema } from '../../../utils/assertions';
import { expectedTotals } from '../../../utils/pricing';
import { catalog } from '../../../utils/testData';

const charger = catalog.byName('Volt USB-C Charger'); // $25.00
const caseItem = catalog.byName('Nimbus Phone Case'); // $12.99

test.describe('Cart API', () => {
  test('a new customer has an empty cart', { tag: '@regression' }, async ({ customer }) => {
    const cart = expectSchema(CartSchema, (await customer.cart.get()).body);

    expect(cart).toMatchObject({
      items: [],
      itemCount: 0,
      subtotal: 0,
      tax: 0,
      shipping: 0,
      total: 0,
    });
  });

  test(
    'adding, updating and removing items keeps totals consistent',
    { tag: ['@smoke', '@regression'] },
    async ({ customer }) => {
      await customer.cart.fill([
        { productId: charger.id, quantity: 1 },
        { productId: caseItem.id, quantity: 2 },
      ]);

      const updated = expectSchema(
        CartSchema,
        (await customer.cart.setQuantity(charger.id, 3)).body,
      );
      expect(updated).toMatchObject(
        expectedTotals([
          { unitPrice: charger.price, quantity: 3 },
          { unitPrice: caseItem.price, quantity: 2 },
        ]),
      );

      const afterRemove = expectSchema(CartSchema, (await customer.cart.remove(caseItem.id)).body);
      expect(afterRemove.items.map((i) => i.productId)).toEqual([charger.id]);
      expect(afterRemove).toMatchObject(
        expectedTotals([{ unitPrice: charger.price, quantity: 3 }]),
      );
    },
  );

  test(
    'crossing $50.00 switches shipping from $5.00 to free',
    { tag: '@regression' },
    async ({ customer }) => {
      const below = expectSchema(CartSchema, (await customer.cart.add(charger.id, 1)).body);
      const atThreshold = expectSchema(CartSchema, (await customer.cart.add(charger.id, 1)).body);

      expect(below).toMatchObject({ subtotal: 25, shipping: 5 });
      expect(atThreshold).toMatchObject({ subtotal: 50, shipping: 0 });
    },
  );

  test(
    'the per-line maximum of 10 applies to the combined quantity',
    { tag: '@regression' },
    async ({ customer }) => {
      expect((await customer.cart.add(charger.id, 6)).status).toBe(201);

      expectApiError(await customer.cart.add(charger.id, 5), 400, 'INVALID_QUANTITY');
      expect((await customer.cart.add(charger.id, 4)).status).toBe(201);
    },
  );

  for (const quantity of [0, -1, 11, 1.5]) {
    test(
      `rejects setting the quantity to ${quantity}`,
      { tag: '@regression' },
      async ({ customer }) => {
        await customer.cart.fill([{ productId: charger.id, quantity: 1 }]);

        expectApiError(
          await customer.cart.setQuantity(charger.id, quantity),
          400,
          'VALIDATION_ERROR',
        );
      },
    );
  }

  test(
    'a numeric string quantity is accepted and coerced (documented behaviour)',
    { tag: '@regression' },
    async ({ customer }) => {
      await customer.cart.fill([{ productId: charger.id, quantity: 1 }]);

      const response = await customer.cart.setQuantity(charger.id, '3');

      expect(expectSchema(CartSchema, response.body).itemCount).toBe(3);
    },
  );

  test(
    'updating or removing an item that is not in the cart returns 404',
    { tag: '@regression' },
    async ({ customer }) => {
      expectApiError(await customer.cart.setQuantity(charger.id, 2), 404, 'CART_ITEM_NOT_FOUND');
      expectApiError(await customer.cart.remove(charger.id), 404, 'CART_ITEM_NOT_FOUND');
    },
  );

  test(
    'adding an unknown or out-of-stock product fails',
    { tag: '@regression' },
    async ({ customer }) => {
      expectApiError(await customer.cart.add(999999, 1), 404, 'PRODUCT_NOT_FOUND');
      expectApiError(
        await customer.cart.add(catalog.byName('Zen Aroma Diffuser').id, 1),
        409,
        'OUT_OF_STOCK',
      );
    },
  );

  test('clearing the cart empties it', { tag: '@regression' }, async ({ customer }) => {
    await customer.cart.fill([{ productId: charger.id, quantity: 2 }]);

    expect((await customer.cart.clear()).status).toBe(204);
    expect(expectSchema(CartSchema, (await customer.cart.get()).body).itemCount).toBe(0);
  });

  test('requires authentication', { tag: '@regression' }, async ({ api }) => {
    expectApiError(await api.get('/api/cart'), 401, 'UNAUTHENTICATED');
    expectApiError(
      await api.post('/api/cart/items', { data: { productId: 1, quantity: 1 } }),
      401,
      'UNAUTHENTICATED',
    );
  });
});
